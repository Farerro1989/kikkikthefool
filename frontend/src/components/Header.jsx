import { fmtMoney } from '../format.js';

export default function Header({ account, onToggleFreeze }) {
  const pnl = account?.unrealized ?? 0;
  const status = account?.status ?? 'ACTIVE';
  return (
    <header className="topbar">
      <div className="logo">
        <span className="logo-mark">⚡</span>
        <span className="logo-name">TradeX</span>
        <span className="logo-sub">模拟交易平台</span>
      </div>
      <div className="acct">
        <div className={`chip ${status === 'ACTIVE' ? 'ok' : 'frozen'}`}>
          {status === 'ACTIVE' ? '账户正常' : '账户已冻结'}
        </div>
        <div className="acct-item">
          <span>账户权益</span>
          <b>{fmtMoney(account?.equity)}</b>
        </div>
        <div className="acct-item">
          <span>可用余额</span>
          <b>{fmtMoney(account?.available)}</b>
        </div>
        <div className="acct-item">
          <span>冻结额</span>
          <b>{fmtMoney(account?.frozen)}</b>
        </div>
        <div className={`acct-item ${pnl >= 0 ? 'up' : 'down'}`}>
          <span>浮动盈亏</span>
          <b>
            {pnl >= 0 ? '+' : ''}
            {fmtMoney(pnl)}
          </b>
        </div>
        <button type="button" className="btn-freeze" onClick={onToggleFreeze}>
          {status === 'ACTIVE' ? '冻结账户' : '解冻账户'}
        </button>
      </div>
    </header>
  );
}
