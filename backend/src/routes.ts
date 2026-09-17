import { Router } from 'express';
import { pool } from './db.js';
import { market } from './engine.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.get('/instruments', (_req, res) => {
  const list = [...market.entries()].map(([symbol, s]) => ({
    symbol,
    name: s.name,
    kind: s.kind,
    price: s.price,
    changePct: ((s.price - s.sessionOpen) / s.sessionOpen) * 100,
  }));
  res.json(list);
});

router.get('/candles', async (req, res) => {
  const symbol = String(req.query.symbol || '');
  const limit = Math.min(Number(req.query.limit) || 240, 1000);
  const s = market.get(symbol);
  if (!s) {
    res.status(404).json({ error: '未知交易对' });
    return;
  }
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
});

router.get('/account', async (_req, res) => {
  const acct = (await pool.query('SELECT balance FROM account WHERE id = 1')).rows[0];
  const positions = (await pool.query('SELECT * FROM positions')).rows;
  let unrealized = 0;
  for (const p of positions) {
    const s = market.get(p.symbol);
    if (s) unrealized += p.qty * (s.price - p.avg_price);
  }
  res.json({
    balance: acct.balance,
    unrealized,
    equity: acct.balance + unrealized,
  });
});

router.get('/positions', async (_req, res) => {
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
});

router.get('/orders', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY id DESC LIMIT 50');
  res.json(rows);
});

router.post('/orders', async (req, res) => {
  const { symbol, side, qty } = req.body || {};
  const s = market.get(symbol);
  if (!s) {
    res.status(400).json({ error: '未知交易对' });
    return;
  }
  if (side !== 'buy' && side !== 'sell') {
    res.status(400).json({ error: '方向无效' });
    return;
  }
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) {
    res.status(400).json({ error: '数量无效' });
    return;
  }

  const price = s.price; // 市价单按当前价即时成交
  const signedQty = side === 'buy' ? q : -q;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const acct = (
      await client.query('SELECT balance FROM account WHERE id = 1 FOR UPDATE')
    ).rows[0];
    const pos = (
      await client.query('SELECT * FROM positions WHERE symbol = $1 FOR UPDATE', [symbol])
    ).rows[0];
    const curQty: number = pos ? pos.qty : 0;
    const curAvg: number = pos ? pos.avg_price : 0;

    if (side === 'buy' && q * price > acct.balance + 1e-9) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: '可用余额不足' });
      return;
    }

    let newQty = curQty + signedQty;
    let newAvg = curAvg;
    if (curQty === 0) {
      newAvg = price;
    } else if (Math.sign(signedQty) === Math.sign(curQty)) {
      // 加仓：加权平均
      newAvg = (Math.abs(curQty) * curAvg + q * price) / (Math.abs(curQty) + q);
    } else if (Math.abs(signedQty) > Math.abs(curQty) + 1e-9) {
      // 反向越过零轴，剩余部分按新方向开仓
      newAvg = price;
    }
    // 纯减仓时均价不变

    await client.query('UPDATE account SET balance = balance - $1 WHERE id = 1', [
      signedQty * price,
    ]);
    if (Math.abs(newQty) < 1e-9) {
      await client.query('DELETE FROM positions WHERE symbol = $1', [symbol]);
    } else {
      await client.query(
        `INSERT INTO positions (symbol, qty, avg_price) VALUES ($1, $2, $3)
         ON CONFLICT (symbol) DO UPDATE SET qty = $2, avg_price = $3`,
        [symbol, newQty, newAvg],
      );
    }
    const order = (
      await client.query(
        `INSERT INTO orders (symbol, side, qty, price)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [symbol, side, q, price],
      )
    ).rows[0];
    await client.query('COMMIT');
    res.json(order);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '下单失败' });
  } finally {
    client.release();
  }
});
