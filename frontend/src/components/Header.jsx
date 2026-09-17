import { fmtMoney } from '../format.js';

export default function Header({ account }) {
  const pnl = account?.unrealized ?? 0;
  return (
    <header className="topbar">
      <div className="logo">
        <span className="logo-mark">⚡</span>
        <span className="logo-name">TradeX</span>
        <span className="logo-sub">模拟交易平台</span>
      </div>
      <div className="acct">
        <div className="acct-item">
          <span>账户权益</span>
          <b>{fmtMoney(account?.equity)}</b>
        </div>
        <div className="acct-item">
          <span>可用余额</span>
          <b>{fmtMoney(account?.balance)}</b>
        </div>
        <div className={`acct-item ${pnl >= 0 ? 'up' : 'down'}`}>
          <span>浮动盈亏</span>
          <b>
            {pnl >= 0 ? '+' : ''}
            {fmtMoney(pnl)}
          </b>
        </div>
      </div>
    </header>
  );
}
