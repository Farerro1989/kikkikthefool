# AGENTS.md

## 项目结构
- `frontend/` — React 18 + Vite 6（纯 JS）交易终端，lightweight-charts v4 蜡烛图
- `backend/` — Node 22 + Express + TypeScript（tsx watch 热重载），模拟撮合 + 行情引擎
- `docker-compose.base44.yml` — 开发编排：postgres 16（db）+ api + web 三个服务

## 运行
```bash
docker compose -f docker-compose.base44.yml up -d --build
```
- 前端 http://localhost:3000（Vite dev server，`/api` 通过 Vite 代理转发到 `api:8000`，单一同源，无 CORS）
- API 只在 compose 内网监听 8000，不映射宿主端口；宿主验证走 `curl localhost:3000/api/...`
- 首次启动各容器会执行 `npm install`（node_modules 放在命名卷里，之后秒级启动）

## 非显而易见的行为
- 无真实外部行情：价格由 `backend/src/engine.ts` 内存随机游走生成，每 1 秒一个 tick，每 5 秒聚合成一根 K 线写入 postgres；首次启动自动 seed：6 个交易对、360 根历史 K 线、账户（id=1）余额 100,000
- `market`（engine.ts）是内存态（最新价、sessionOpen、进行中的 K 线）；进程重启后从最后一根已落库 K 线的 close 恢复。`GET /api/candles` 会在末尾追加内存中正在形成的 K 线，所以图表最后一根是实时的
- 表结构由 `initDb()`（backend/src/db.ts）启动时 `CREATE TABLE IF NOT EXISTS` 保证，没有单独的迁移/seed 命令
- 下单：`POST /api/orders` 市价单、按当前内存价即时成交，支持做多/做空/加仓/减仓/反手；买入受余额约束。全部在一个事务里用 `FOR UPDATE` 锁行
- 金额单位统一按 USDT 计

## 验证
```bash
curl localhost:3000/api/instruments
curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' \
  -d '{"symbol":"BTCUSDT","side":"buy","qty":0.01}'
curl localhost:3000/api/account
curl localhost:3000/api/positions
```

## 密钥
全部数据为本地模拟，不需要任何第三方凭证。
