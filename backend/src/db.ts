import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS instruments (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_price DOUBLE PRECISION NOT NULL,
  volatility DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS candles (
  symbol TEXT NOT NULL,
  ts DOUBLE PRECISION NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (symbol, ts)
);
CREATE TABLE IF NOT EXISTS account (
  id INT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  balance DOUBLE PRECISION NOT NULL,
  frozen DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  client_order_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'market',
  qty DOUBLE PRECISION NOT NULL,
  limit_price DOUBLE PRECISION,
  price DOUBLE PRECISION,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 旧结构平滑升级（幂等）：必须先补列，再建幂等索引
DO $$
BEGIN
  ALTER TABLE account ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
  ALTER TABLE account ADD COLUMN IF NOT EXISTS frozen DOUBLE PRECISION NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'market';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS limit_price DOUBLE PRECISION;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_order_id TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS reason TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  -- 新语义：成交价在成交时才写入
  ALTER TABLE orders ALTER COLUMN price DROP NOT NULL;
END $$;
UPDATE orders SET status = 'FILLED' WHERE status = 'filled';

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_order_id_uidx
  ON orders (client_order_id) WHERE client_order_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS order_events (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  operator TEXT NOT NULL DEFAULT 'trader',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL DEFAULT 1,
  order_id INT,
  kind TEXT NOT NULL,
  avail_delta DOUBLE PRECISION NOT NULL,
  frozen_delta DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_events (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL DEFAULT 1,
  action TEXT NOT NULL,
  reason TEXT,
  operator TEXT NOT NULL DEFAULT 'trader',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS positions (
  symbol TEXT PRIMARY KEY,
  qty DOUBLE PRECISION NOT NULL,
  avg_price DOUBLE PRECISION NOT NULL
);
`;

const INSTRUMENTS: [string, string, string, number, number][] = [
  ['BTCUSDT', 'Bitcoin / USDT', 'crypto', 65000, 0.0012],
  ['ETHUSDT', 'Ethereum / USDT', 'crypto', 3200, 0.0015],
  ['AAPL', 'Apple Inc.', 'stock', 195, 0.0009],
  ['TSLA', 'Tesla Inc.', 'stock', 240, 0.0022],
  ['EURUSD', 'Euro / US Dollar', 'forex', 1.09, 0.0003],
  ['XAUUSD', 'Gold / US Dollar', 'commodity', 2350, 0.0006],
];

export async function initDb() {
  await pool.query(SCHEMA);
  for (const [symbol, name, kind, basePrice, volatility] of INSTRUMENTS) {
    await pool.query(
      `INSERT INTO instruments (symbol, name, kind, base_price, volatility)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (symbol) DO NOTHING`,
      [symbol, name, kind, basePrice, volatility],
    );
  }
  await pool.query(
    `INSERT INTO account (id, balance) VALUES (1, 100000)
     ON CONFLICT (id) DO NOTHING`,
  );

  // 账本回填：确保账本与账户缓存可对账
  // FUND 记初始资金（与账户 seed 一致）；旧成交另以 SETTLE 补录，避免双倍记账
  const funds = (
    await pool.query(`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE kind = 'FUND'`)
  ).rows[0].n;
  if (funds === 0) {
    await pool.query(
      `INSERT INTO ledger_entries (account_id, kind, avail_delta, frozen_delta, status, reason)
       VALUES (1, 'FUND', 100000, 0, 'POSTED', '初始虚拟资金')`,
    );
  }
  // 历史成交补录 SETTLE 分录（升级前成交的订单）
  const missing = (
    await pool.query(
      `SELECT o.id, o.side, o.qty, o.price FROM orders o
       LEFT JOIN ledger_entries l ON l.order_id = o.id
       WHERE l.id IS NULL AND o.status = 'FILLED' AND o.price IS NOT NULL`,
    )
  ).rows;
  for (const o of missing) {
    await pool.query(
      `INSERT INTO ledger_entries (account_id, order_id, kind, avail_delta, frozen_delta, status, reason)
       VALUES (1, $1, 'SETTLE', $2, 0, 'POSTED', $3)`,
      [o.id, o.side === 'buy' ? -(o.qty * o.price) : o.qty * o.price, `历史成交补录 #${o.id}`],
    );
  }
}
