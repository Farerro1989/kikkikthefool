import express from 'express';
import { initDb, pool } from './db.js';
import { initEngine, startEngine } from './engine.js';
import { router } from './routes.js';

const PORT = Number(process.env.PORT) || 8000;

async function main() {
  // 数据库就绪重试（容器启动顺序兜底）
  let lastErr: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (i === 9) throw lastErr;
  }

  await initDb();
  await initEngine();
  startEngine();

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((e) => {
  console.error('failed to start:', e);
  process.exit(1);
});
