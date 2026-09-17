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
  balance DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'filled',
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
}
