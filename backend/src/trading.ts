import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { market } from './market.js';
import { ApiError } from './errors.js';
import { postLedgerEntry, updateAccountCache } from './ledger.js';

/** 可撤销状态集合 */
const CANCELLABLE = ['NEW', 'ACCEPTED', 'OPEN', 'PARTIALLY_FILLED'];

interface PlaceInput {
  symbol: string;
  side: string;
  qty: unknown;
  type?: string;
  limitPrice?: unknown;
  clientOrderId?: string;
}

async function addOrderEvent(
  client: PoolClient,
  orderId: number,
  fromStatus: string | null,
  toStatus: string,
  reason: string,
  operator = 'trader',
) {
  await client.query(
    `INSERT INTO order_events (order_id, from_status, to_status, reason, operator)
     VALUES ($1, $2, $3, $4, $5)`,
    [orderId, fromStatus, toStatus, reason, operator],
  );
}

/** 加权平均持仓更新（支持加仓/减仓/反手） */
async function applyPositionFill(
  client: PoolClient,
  symbol: string,
  side: string,
  qty: number,
  price: number,
) {
  const pos = (
    await client.query('SELECT * FROM positions WHERE symbol = $1 FOR UPDATE', [symbol])
  ).rows[0];
  const curQty: number = pos ? pos.qty : 0;
  const curAvg: number = pos ? pos.avg_price : 0;
  const signed = side === 'buy' ? qty : -qty;
  const newQty = curQty + signed;
  let newAvg = curAvg;
  if (curQty === 0) {
    newAvg = price;
  } else if (Math.sign(signed) === Math.sign(curQty)) {
    newAvg = (Math.abs(curQty) * curAvg + qty * price) / (Math.abs(curQty) + qty);
  } else if (Math.abs(signed) > Math.abs(curQty) + 1e-9) {
    newAvg = price; // 反向越过零轴，剩余部分按新方向开仓
  }
  if (Math.abs(newQty) < 1e-9) {
    await client.query('DELETE FROM positions WHERE symbol = $1', [symbol]);
  } else {
    await client.query(
      `INSERT INTO positions (symbol, qty, avg_price) VALUES ($1, $2, $3)
       ON CONFLICT (symbol) DO UPDATE SET qty = $2, avg_price = $3`,
      [symbol, newQty, newAvg],
    );
  }
}

async function fillOrder(
  client: PoolClient,
  order: any,
  fillPrice: number,
  operator: string,
  reason: string,
) {
  await applyPositionFill(client, order.symbol, order.side, order.qty, fillPrice);
  await client.query(
    `UPDATE orders SET status = 'FILLED', price = $1, updated_at = now() WHERE id = $2`,
    [fillPrice, order.id],
  );
  await addOrderEvent(client, order.id, order.status, 'FILLED', reason, operator);
}

async function rejectOrder(client: PoolClient, order: any, reason: string) {
  await client.query(
    `UPDATE orders SET status = 'REJECTED', reason = $1, updated_at = now() WHERE id = $2`,
    [reason, order.id],
  );
  await addOrderEvent(client, order.id, order.status, 'REJECTED', reason);
}

/**
 * 下单：市价单即时成交；限价买单冻结资金后进入订单簿。
 * 幂等：同一 clientOrderId 重复提交直接返回原订单，不重复扣款。
 */
export async function placeOrder(input: PlaceInput): Promise<{ order: any; duplicated: boolean }> {
  const s = market.get(input.symbol);
  if (!s) throw new ApiError('UNKNOWN_SYMBOL', '未知交易对');
  if (input.side !== 'buy' && input.side !== 'sell') throw new ApiError('INVALID_SIDE', '方向无效');
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new ApiError('INVALID_QTY', '数量无效');
  const type = input.type || 'market';
  if (type !== 'market' && type !== 'limit') throw new ApiError('INVALID_TYPE', '订单类型无效');
  let limitPrice = 0;
  if (type === 'limit') {
    limitPrice = Number(input.limitPrice);
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) throw new ApiError('INVALID_LIMIT', '限价无效');
  }

  const client = await pool.connect();
  let txOpen = false;
  try {
    await client.query('BEGIN');
    txOpen = true;
    const acct = (await client.query('SELECT * FROM account WHERE id = 1 FOR UPDATE')).rows[0];
    if (acct.status !== 'ACTIVE') {
      await client.query('COMMIT');
      txOpen = false;
      throw new ApiError(
        'ACCOUNT_NOT_ACTIVE',
        acct.status === 'FROZEN' ? '账户已冻结，禁止下单' : '账户状态不允许下单',
      );
    }
    const available = acct.balance - acct.frozen;

    let order = (
      await client.query(
        `INSERT INTO orders (client_order_id, symbol, side, type, qty, limit_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'NEW')
         ON CONFLICT (client_order_id) WHERE client_order_id IS NOT NULL DO NOTHING
         RETURNING *`,
        [
          input.clientOrderId || null,
          input.symbol,
          input.side,
          type,
          qty,
          type === 'limit' ? limitPrice : null,
        ],
      )
    ).rows[0];
    if (!order) {
      order = (
        await client.query('SELECT * FROM orders WHERE client_order_id = $1', [input.clientOrderId])
      ).rows[0];
      await client.query('COMMIT');
      txOpen = false;
      return { order, duplicated: true };
    }
    await addOrderEvent(client, order.id, null, 'NEW', '接单');

    if (type === 'market') {
      const price = s.price;
      const cost = qty * price;
      if (input.side === 'buy' && cost > available + 1e-9) {
        await rejectOrder(client, order, '可用余额不足');
        await client.query('COMMIT');
        txOpen = false;
        throw new ApiError('INSUFFICIENT_BALANCE', '可用余额不足');
      }
      const delta = input.side === 'buy' ? -cost : cost;
      await postLedgerEntry(client, {
        orderId: order.id,
        kind: 'SETTLE',
        availDelta: delta,
        reason: `${input.side === 'buy' ? '市价买入' : '市价卖出'} ${qty} ${input.symbol} @ ${price}`,
      });
      await updateAccountCache(client, delta, 0);
      await fillOrder(client, order, price, 'engine', '市价成交');
    } else {
      if (input.side === 'buy') {
        const cost = qty * limitPrice;
        if (cost > available + 1e-9) {
          await rejectOrder(client, order, '可用余额不足');
          await client.query('COMMIT');
          txOpen = false;
          throw new ApiError('INSUFFICIENT_BALANCE', '可用余额不足');
        }
        await postLedgerEntry(client, {
          orderId: order.id,
          kind: 'FREEZE',
          availDelta: -cost,
          frozenDelta: cost,
          reason: `限价买单冻结 ${qty} ${input.symbol} @ ${limitPrice}`,
        });
        await updateAccountCache(client, -cost, cost);
      }
      await client.query(`UPDATE orders SET status = 'OPEN', updated_at = now() WHERE id = $1`, [
        order.id,
      ]);
      await addOrderEvent(client, order.id, 'NEW', 'OPEN', '限价单进入订单簿');
    }

    const final = (await client.query('SELECT * FROM orders WHERE id = $1', [order.id])).rows[0];
    await client.query('COMMIT');
    txOpen = false;
    return { order: final, duplicated: false };
  } catch (e) {
    if (txOpen) await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** 撤单：OPEN -> CANCEL_REQUESTED -> CANCELED，限价买单解冻资金 */
export async function cancelOrder(id: number) {
  const client = await pool.connect();
  let txOpen = false;
  try {
    await client.query('BEGIN');
    txOpen = true;
    const acct = (await client.query('SELECT * FROM account WHERE id = 1 FOR UPDATE')).rows[0];
    const order = (await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      txOpen = false;
      throw new ApiError('ORDER_NOT_FOUND', '订单不存在', 404);
    }
    if (acct.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      txOpen = false;
      throw new ApiError('ACCOUNT_NOT_ACTIVE', '账户已冻结，禁止撤单');
    }
    if (!CANCELLABLE.includes(order.status)) {
      await client.query('ROLLBACK');
      txOpen = false;
      throw new ApiError('NOT_CANCELLABLE', '订单不可撤销');
    }
    await client.query(
      `UPDATE orders SET status = 'CANCEL_REQUESTED', updated_at = now() WHERE id = $1`,
      [id],
    );
    await addOrderEvent(client, id, order.status, 'CANCEL_REQUESTED', '用户请求撤单');
    if (order.type === 'limit' && order.side === 'buy') {
      const held = order.qty * order.limit_price;
      await postLedgerEntry(client, {
        orderId: id,
        kind: 'UNFREEZE',
        availDelta: held,
        frozenDelta: -held,
        reason: `撤单解冻 ${order.symbol}`,
      });
      await updateAccountCache(client, held, -held);
    }
    await client.query(`UPDATE orders SET status = 'CANCELED', updated_at = now() WHERE id = $1`, [id]);
    await addOrderEvent(client, id, 'CANCEL_REQUESTED', 'CANCELED', '撤单完成');
    const final = (await client.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
    await client.query('COMMIT');
    txOpen = false;
    return final;
  } catch (e) {
    if (txOpen) await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** 撮合：每秒由行情引擎调用，检查 OPEN 限价单是否触价成交；账户冻结时不撮合 */
export async function matchOpenOrders() {
  const acct = (await pool.query('SELECT status FROM account WHERE id = 1')).rows[0];
  if (!acct || acct.status !== 'ACTIVE') return;
  const { rows } = await pool.query(`SELECT * FROM orders WHERE status = 'OPEN'`);
  for (const o of rows) {
    const s = market.get(o.symbol);
    if (!s || !o.limit_price) continue;
    const hit = o.side === 'buy' ? s.price <= o.limit_price : s.price >= o.limit_price;
    if (!hit) continue;
    const fillPrice = s.price;
    const client = await pool.connect();
    let txOpen = false;
    try {
      await client.query('BEGIN');
      txOpen = true;
      const cur = (await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [o.id])).rows[0];
      if (!cur || cur.status !== 'OPEN') {
        await client.query('COMMIT');
        txOpen = false;
        continue;
      }
      if (o.side === 'buy') {
        // 成交价优于限价时，差额退回可用余额
        const held = o.qty * o.limit_price;
        const refund = held - o.qty * fillPrice;
        await postLedgerEntry(client, {
          orderId: o.id,
          kind: 'SETTLE',
          availDelta: refund,
          frozenDelta: -held,
          reason: `限价买单成交 ${o.symbol} @ ${fillPrice}`,
        });
        await updateAccountCache(client, refund, -held);
      } else {
        const proceeds = o.qty * fillPrice;
        await postLedgerEntry(client, {
          orderId: o.id,
          kind: 'SETTLE',
          availDelta: proceeds,
          reason: `限价卖单成交 ${o.symbol} @ ${fillPrice}`,
        });
        await updateAccountCache(client, proceeds, 0);
      }
      await fillOrder(client, cur, fillPrice, 'engine', `触价成交（限价 ${o.limit_price}）`);
      await client.query('COMMIT');
      txOpen = false;
    } catch (e) {
      if (txOpen) await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  }
}
