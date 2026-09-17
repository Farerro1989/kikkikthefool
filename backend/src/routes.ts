import { Router } from 'express';
import { pool } from './db.js';
import { market } from './market.js';
import { ApiError } from './errors.js';
import { cancelOrder, placeOrder } from './trading.js';
import { setAccountStatus } from './ledger.js';

export const router = Router();

/** 统一错误响应：{ code, error } */
const wrap =
  (fn: (req: any, res: any) => Promise<void>) =>
  async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (e: any) {
      if (e instanceof ApiError) {
        res.status(e.status).json({ code: e.code, error: e.message });
      } else {
        console.error('API error:', e);
        res.status(500).json({ code: 'INTERNAL', error: '服务器内部错误' });
      }
    }
  };

router.get('/health', wrap(async (_req, res) => {
  res.json({ ok: true });
}));

router.get('/instruments', wrap(async (_req, res) => {
  const list = [...market.entries()].map(([symbol, s]) => ({
    symbol,
    name: s.name,
    kind: s.kind,
    price: s.price,
    changePct: ((s.price - s.sessionOpen) / s.sessionOpen) * 100,
  }));
  res.json(list);
}));

router.get('/candles', wrap(async (req, res) => {
  const symbol = String(req.query.symbol || '');
  const limit = Math.min(Number(req.query.limit) || 240, 1000);
  const s = market.get(symbol);
  if (!s) throw new ApiError('UNKNOWN_SYMBOL', '未知交易对', 404);
  const { rows } = await pool.query(
    `SELECT ts, open, high, low, close, volume FROM candles
     WHERE symbol = $1 ORDER BY ts DESC LIMIT $2`,
    [symbol, limit],
  );
  rows.reverse();
  // 补上内存中正在形成的最新 K 线，保证图表末尾是实时的
  if (s.cur.ts > 0 && (rows.length === 0 || s.cur.ts > rows[rows.length - 1].ts)) {
    rows.push({ ...s.cur });
  }
  res.json(rows);
}));

router.get('/account', wrap(async (_req, res) => {
  const acct = (await pool.query('SELECT * FROM account WHERE id = 1')).rows[0];
  const positions = (await pool.query('SELECT * FROM positions')).rows;
  let unrealized = 0;
  let posValue = 0;
  for (const p of positions) {
    const s = market.get(p.symbol);
    if (s) {
      unrealized += p.qty * (s.price - p.avg_price);
      posValue += p.qty * s.price;
    }
  }
  res.json({
    status: acct.status,
    balance: acct.balance,
    frozen: acct.frozen,
    available: acct.balance - acct.frozen,
    unrealized,
    equity: acct.balance + acct.frozen + posValue,
  });
}));

router.get('/positions', wrap(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM positions ORDER BY symbol');
  res.json(
    rows.map((p: any) => {
      const s = market.get(p.symbol)!;
      const pnl = p.qty * (s.price - p.avg_price);
      return {
        symbol: p.symbol,
        name: s.name,
        qty: p.qty,
        avgPrice: p.avg_price,
        price: s.price,
        marketValue: p.qty * s.price,
        pnl,
        pnlPct: (pnl / (Math.abs(p.qty) * p.avg_price)) * 100,
      };
    }),
  );
}));

router.get('/orders', wrap(async (req, res) => {
  if (req.query.status === 'open') {
    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE status IN ('NEW', 'ACCEPTED', 'OPEN', 'PARTIALLY_FILLED')
       ORDER BY id DESC`,
    );
    res.json(rows);
    return;
  }
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY id DESC LIMIT 50');
  res.json(rows);
}));

router.get('/ledger', wrap(async (_req, res) => {
  // 资金流水明细：窗口函数累计出每笔分录后的可用/冻结余额快照
  const { rows } = await pool.query(`
    SELECT *,
      SUM(avail_delta) OVER (ORDER BY id) AS avail_after,
      SUM(frozen_delta) OVER (ORDER BY id) AS frozen_after
    FROM ledger_entries ORDER BY id DESC LIMIT 100`);
  res.json(rows);
}));

router.post('/orders', wrap(async (req, res) => {
  const { order, duplicated } = await placeOrder(req.body || {});
  res.json({ ...order, duplicated });
}));

router.post('/orders/:id/cancel', wrap(async (req, res) => {
  res.json(await cancelOrder(Number(req.params.id)));
}));

router.post('/account/freeze', wrap(async (req, res) => {
  res.json(await setAccountStatus('FROZEN', req.body?.reason));
}));

router.post('/account/unfreeze', wrap(async (req, res) => {
  res.json(await setAccountStatus('ACTIVE', req.body?.reason));
}));
