import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { ApiError } from './errors.js';

export interface EntryInput {
  orderId?: number | null;
  kind: 'FUND' | 'FREEZE' | 'UNFREEZE' | 'SETTLE';
  availDelta?: number;
  frozenDelta?: number;
  reason?: string;
}

/**
 * 账本分录：不可变，已 POSTED 的分录不原地修改，只能以反向分录纠正。
 * 当前实现中分录与业务事务同库同事务提交，因此直接落 POSTED；
 * PENDING/REJECTED 状态保留给未来的异步结算流程。
 */
export async function postLedgerEntry(client: PoolClient, e: EntryInput) {
  await client.query(
    `INSERT INTO ledger_entries (account_id, order_id, kind, avail_delta, frozen_delta, status, reason)
     VALUES (1, $1, $2, $3, $4, 'POSTED', $5)`,
    [e.orderId ?? null, e.kind, e.availDelta ?? 0, e.frozenDelta ?? 0, e.reason ?? ''],
  );
}

/** 更新账户缓存投影（balance/frozen）；账本才是事实来源，两者同事务更新保证可对账 */
export async function updateAccountCache(
  client: PoolClient,
  availDelta: number,
  frozenDelta: number,
) {
  await client.query(
    'UPDATE account SET balance = balance + $1, frozen = frozen + $2 WHERE id = 1',
    [availDelta, frozenDelta],
  );
}

/** 账户状态机：ACTIVE ⇄ FROZEN，每次迁移写入 account_events 审计 */
export async function setAccountStatus(target: 'ACTIVE' | 'FROZEN', reason?: string) {
  const client = await pool.connect();
  let txOpen = false;
  try {
    await client.query('BEGIN');
    txOpen = true;
    const acct = (await client.query('SELECT * FROM account WHERE id = 1 FOR UPDATE')).rows[0];
    if (acct.status === target) {
      await client.query('ROLLBACK');
      txOpen = false;
      throw new ApiError('INVALID_STATE', target === 'FROZEN' ? '账户已是冻结状态' : '账户已是正常状态');
    }
    if (target === 'FROZEN' && acct.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      txOpen = false;
      throw new ApiError('INVALID_STATE', '仅正常状态可冻结');
    }
    if (target === 'ACTIVE' && acct.status !== 'FROZEN') {
      await client.query('ROLLBACK');
      txOpen = false;
      throw new ApiError('INVALID_STATE', '仅冻结状态可解冻');
    }
    await client.query('UPDATE account SET status = $1 WHERE id = 1', [target]);
    await client.query(
      `INSERT INTO account_events (account_id, action, reason, operator)
       VALUES (1, $1, $2, 'trader')`,
      [target === 'FROZEN' ? 'FREEZE' : 'UNFREEZE', reason || ''],
    );
    await client.query('COMMIT');
    txOpen = false;
    return { status: target };
  } catch (e) {
    if (txOpen) await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
