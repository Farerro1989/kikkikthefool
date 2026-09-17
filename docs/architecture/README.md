# 模拟交易平台：架构基线

本仓库是模拟交易平台（paper trading）的全栈实现，架构对齐 `C:\TradingPlatform` 第一阶段基线
（订单 / 账户 / 账本三类状态机、模块职责、MVP 边界、幂等键与错误码），范围严格限定在模拟交易，
不接入任何真实资金、支付、提现或真实行情源。

## 目录与模块职责

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| 客户端 | `frontend/` | 展示行情、账户、订单、账本与审计信息；提交带幂等键的模拟交易命令 |
| 行情服务 | `backend/src/engine.ts` + `market.ts` | 可控的模拟行情（随机游走 tick + 5 秒 K 线），不连接真实行情源 |
| 交易服务 | `backend/src/trading.ts` | 订单校验、市价/限价撮合、撤单、成交事件；**不直接改余额表**，一切账务走账本域 |
| 账本/账户域 | `backend/src/ledger.ts` | 不可变分录（FUND/FREEZE/UNFREEZE/SETTLE）记录可用额、冻结额与结算；账户状态机（ACTIVE ⇄ FROZEN） |
| API 层 | `backend/src/routes.ts` | API 契约、统一错误码 `{ code, error }`、幂等键透传 |
| 存储 | PostgreSQL（compose 服务） | 唯一状态存储；表结构由 `initDb()` 启动时保证（含旧结构平滑升级与账本回填） |

## 模拟交易 MVP 边界

### 纳入
1. 内存 + DB 中的模拟账户、资产、行情快照与订单。
2. 限价单/市价单的下单、撤单、撮合结果展示与审计事件（`order_events` / `account_events` / `ledger_entries`）。
3. 仅使用虚拟初始资金 100,000；所有账务变更以不可变分录可追溯、可重放、可对账。
4. 明确的 API 契约、幂等键（`clientOrderId`）与错误码。

### 排除
真实充值/提现、支付、银行卡或链上转账、真实交易所下单、生产行情源、杠杆清算、复杂风控、
营销返佣、生产部署。

## 状态机（实现落地）

### 订单
```
NEW ─(市价)→ FILLED
NEW ─(限价)→ OPEN ─(触价)→ FILLED
OPEN → CANCEL_REQUESTED → CANCELED
资金不足 → REJECTED
```
终态：`FILLED` / `CANCELED` / `REJECTED`。每次迁移写入 `order_events`（订单号、前后状态、
原因、操作者 trader/engine、时间戳）。重复 `clientOrderId` 不重复扣款（唯一索引 + ON CONFLICT
返回原订单，响应带 `duplicated: true`）。

### 模拟账户
`CREATED → ACTIVE ⇄ FROZEN`。`FROZEN` 只允许查询与解冻：禁止下单、撤单与撮合。
状态变化写入 `account_events`。

### 账本分录
`PENDING → POSTED`（失败 `REJECTED`）。当前实现中分录与业务事务同库同事务提交，
直接落 `POSTED`；`PENDING`/`REJECTED` 保留给未来异步结算流程。
已 `POSTED` 的分录不原地修改，只能以反向分录纠正（撤单解冻与订单冻结成对可对账）。

## 会计模型
- `account.balance/frozen` 是缓存投影，`ledger_entries` 是事实来源；两者同事务更新，
  可用 `SUM(avail_delta)` 对账。
- 限价买单：下单冻结（FREEZE：可用 -cost / 冻结 +cost）；触价成交解冻结算（SETTLE：冻结 -held，
  成交价优于限价的差额退回可用）；撤单解冻（UNFREEZE）。
- 市价单与卖单：成交即结算（SETTLE）。
- 账户权益 = 可用 + 冻结 + Σ持仓市值（做空为负）。

## API 契约
```
GET  /api/instruments                     行情列表（现价、涨跌幅）
GET  /api/candles?symbol=&limit=          K 线（含内存中实时最后一根）
GET  /api/account                         账户（status/balance/frozen/available/unrealized/equity）
GET  /api/positions                       持仓
GET  /api/orders                          订单记录（近 50 条）
GET  /api/orders?status=open              挂单
GET  /api/ledger                          账本分录（近 60 条）
POST /api/orders                          下单 { symbol, side, qty, type, limitPrice?, clientOrderId? }
POST /api/orders/:id/cancel               撤单
POST /api/account/freeze | unfreeze      账户冻结/解冻 { reason }
```
错误统一 `{ code, error }`，code 如 `UNKNOWN_SYMBOL / INVALID_QTY / INVALID_LIMIT /
INSUFFICIENT_BALANCE / ACCOUNT_NOT_ACTIVE / NOT_CANCELLABLE / ORDER_NOT_FOUND`。

## 验收标准
- [x] 订单/账户/账本三类状态机落地，迁移全部产生审计事件
- [x] 重复幂等键不重复扣款
- [x] 限价单冻结/成交结算/撤单解冻分录成对可对账
- [x] 账户冻结后下单、撤单、撮合均被拒绝
- [x] 不接任何真实资金/支付/提现接口，行情为本地模拟
