import { pool } from './db.js';

export const CANDLE_MS = 5000; // 一根 K 线 = 5 秒（演示用快节奏）
const HISTORY_CANDLES = 360;
const TICK_MS = 1000;

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InstrumentState {
  name: string;
  kind: string;
  volatility: number;
  price: number;
  sessionOpen: number;
  cur: Candle;
}

/** 内存中的实时行情状态，重启后从最后一根 K 线恢复 */
export const market = new Map<string, InstrumentState>();

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function seedHistory(symbol: string, startPrice: number, volatility: number) {
  const rows: (string | number)[][] = [];
  let p = startPrice;
  const firstTs = Math.floor((Date.now() - HISTORY_CANDLES * CANDLE_MS) / CANDLE_MS) * CANDLE_MS;
  for (let i = 0; i < HISTORY_CANDLES; i++) {
    const ts = firstTs + i * CANDLE_MS;
    const open = p;
    let high = open;
    let low = open;
    let close = open;
    for (let t = 0; t < 5; t++) {
      close = Math.max(close * (1 + gauss() * volatility), 1e-6);
      high = Math.max(high, close);
      low = Math.min(low, close);
    }
    rows.push([symbol, ts, open, high, low, close, Math.round(500 + Math.random() * 5000)]);
    p = close;
  }
  const chunk = 120;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: (string | number)[] = [];
    const values = part.map((r, idx) => {
      const b = idx * 7;
      params.push(...r);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    await pool.query(
      `INSERT INTO candles (symbol, ts, open, high, low, close, volume)
       VALUES ${values.join(',')}
       ON CONFLICT (symbol, ts) DO NOTHING`,
      params,
    );
  }
  return { lastPrice: p, sessionOpen: rows[0][2] as number };
}

export async function initEngine() {
  const { rows: instruments } = await pool.query('SELECT * FROM instruments');
  for (const inst of instruments) {
    const last = (
      await pool.query(
        'SELECT close FROM candles WHERE symbol = $1 ORDER BY ts DESC LIMIT 1',
        [inst.symbol],
      )
    ).rows;
    let price: number;
    let sessionOpen: number;
    if (last.length === 0) {
      const seeded = await seedHistory(inst.symbol, inst.base_price, inst.volatility);
      price = seeded.lastPrice;
      sessionOpen = seeded.sessionOpen;
    } else {
      price = last[0].close;
      const first = (
        await pool.query(
          'SELECT open FROM candles WHERE symbol = $1 ORDER BY ts ASC LIMIT 1',
          [inst.symbol],
        )
      ).rows;
      sessionOpen = first[0].open;
    }
    market.set(inst.symbol, {
      name: inst.name,
      kind: inst.kind,
      volatility: inst.volatility,
      price,
      sessionOpen,
      cur: { ts: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 },
    });
  }
}

export function startEngine() {
  setInterval(() => {
    tick().catch((e) => console.error('tick failed:', e.message));
  }, TICK_MS);
}

function persistCandle(symbol: string, c: Candle) {
  pool
    .query(
      `INSERT INTO candles (symbol, ts, open, high, low, close, volume)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (symbol, ts) DO NOTHING`,
      [symbol, c.ts, c.open, c.high, c.low, c.close, c.volume],
    )
    .catch((e) => console.error('candle persist failed:', e.message));
}

async function tick() {
  const bucket = Math.floor(Date.now() / CANDLE_MS) * CANDLE_MS;
  for (const [symbol, s] of market) {
    s.price = Math.max(s.price * (1 + gauss() * s.volatility), 1e-6);
    if (s.cur.ts === 0) {
      s.cur = { ts: bucket, open: s.price, high: s.price, low: s.price, close: s.price, volume: 0 };
      continue;
    }
    if (bucket > s.cur.ts) {
      const finished = { ...s.cur };
      persistCandle(symbol, finished);
      s.cur = {
        ts: bucket,
        open: finished.close,
        high: Math.max(finished.close, s.price),
        low: Math.min(finished.close, s.price),
        close: s.price,
        volume: 0,
      };
    }
    s.cur.close = s.price;
    s.cur.high = Math.max(s.cur.high, s.price);
    s.cur.low = Math.min(s.cur.low, s.price);
    s.cur.volume += Math.round(50 + Math.random() * 500);
  }
}
