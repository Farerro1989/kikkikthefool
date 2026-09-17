# AGENTS.md

## 项目结构
- `frontend/` — React 18 + Vite 6（纯 JS）交易终端，lightweight-charts v4 蜡烛图
- `backend/` — Node 22 + Express + TypeScript（tsx watch 热重载）
- `docs/architecture/README.md` — 架构基线：模块职责、MVP 边界、三类状态机、API 契约
- `docker-compose.base44.yml` — 开发编排：postgres 16（db）+ api + web 三个服务

## 架构分层（backend/src）
- `market.ts` — 内存行情状态（最新价、sessionOpen、进行中 K 线），重启后从 DB 恢复
- `engine.ts` — 行情模拟（每秒 tick、5 秒 K 线、首次 seed 360 根历史），每秒调用 `matchOpenOrders()`
- `trading.ts` — 下单/撤单/撮合（订单状态机 NEW→OPEN→FILLED / CANCELED / REJECTED），**不直接改余额**
- `ledger.ts` — 不可变账本分录 + 账户缓存投影 + 账户状态机（ACTIVE ⇄ FROZEN）
- `routes.ts` — API 契约，统一错误 `{ code, error }`
- `errors.ts` — `ApiError`（code + message）

## 运行
```bash
docker compose -f docker-compose.base44.yml up -d --build
```
- 前端 http://localhost:3000（Vite dev server，`/api` 通过 Vite 代理转发到 `api:8000`，单一同源，无 CORS）
- API 只在 compose 内网监听 8000；宿主验证走 `curl localhost:3000/api/...`
- 首次启动各容器会执行 `npm install`（node_modules 放在命名卷里，之后秒级启动）

## 非显而易见的行为
- 表结构由 `initDb()`（db.ts）启动时保证：含 `account.status/frozen`、`orders.type/limit_price/client_order_id` 等列的幂等迁移、旧 `filled` 状态归一化，以及账本回填（FUND 补录 + 历史成交 SETTLE 补录），保证 `SUM(avail_delta)` 与账户缓存可对账
- `client_order_id` 是幂等键：唯一部分索引 `WHERE client_order_id IS NOT NULL`；下单 `ON CONFLICT DO NOTHING`，冲突时返回原订单并带 `duplicated: true`，不重复扣款
- 限价买单资金流：FREEZE（可用-cost/冻结+cost）→ 触价成交 SETTLE（冻结-held，价差退回可用）→ 撤单则 UNFREEZE；三者成对可对账
- 账户 FROZEN 时：下单/撤单被拒（ACCOUNT_NOT_ACTIVE），撮合循环直接跳过
- `market`（market.ts）是内存态；进程重启后从最后一根已落库 K 线的 close 恢复；`GET /api/candles` 末尾追加内存中正在形成的 K 线
- 权益 = 可用 + 冻结 + Σ持仓市值（做空为负）；余额单位 USDT
- 全部为本地模拟数据，不需要任何第三方凭证

## 验证
```bash
curl localhost:3000/api/instruments
# 市价单
curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' \
  -d '{"symbol":"BTCUSDT","side":"buy","qty":0.01,"type":"market","clientOrderId":"t1"}'
# 重复幂等键 → 返回原订单 duplicated:true，余额不变
# 限价单（挂单后 frozen 增加）
curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' \
  -d '{"symbol":"BTCUSDT","side":"buy","qty":0.01,"type":"limit","limitPrice":10000,"clientOrderId":"t2"}'
curl localhost:3000/api/orders?status=open
curl -X POST localhost:3000/api/orders/2/cancel   # 撤单解冻
curl localhost:3000/api/account
curl localhost:3000/api/ledger
curl -X POST localhost:3000/api/account/freeze    # 冻结后下单返回 ACCOUNT_NOT_ACTIVE
curl -X POST localhost:3000/api/account/unfreeze
```
