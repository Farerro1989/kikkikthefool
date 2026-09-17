import { fmtMoney, fmtPrice, fmtQty } from '../format.js';

export default function PositionsTable({ positions, onClose }) {
  return (
    <div className="panel">
      <h3>当前持仓</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>交易对</th>
              <th>方向</th>
              <th>数量</th>
              <th>均价</th>
              <th>现价</th>
              <th>市值</th>
              <th>浮动盈亏</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol}>
                <td>
                  <b>{p.symbol}</b>
                  <div className="cell-sub">{p.name}</div>
                </td>
                <td className={p.qty > 0 ? 'up' : 'down'}>{p.qty > 0 ? '多' : '空'}</td>
                <td>{fmtQty(Math.abs(p.qty))}</td>
                <td>{fmtPrice(p.avgPrice)}</td>
                <td>{fmtPrice(p.price)}</td>
                <td>{fmtMoney(p.marketValue)}</td>
                <td className={p.pnl >= 0 ? 'up' : 'down'}>
                  {p.pnl >= 0 ? '+' : ''}
                  {fmtMoney(p.pnl)}
                  <div className="cell-sub">
                    {p.pnl >= 0 ? '+' : ''}
                    {p.pnlPct.toFixed(2)}%
                  </div>
                </td>
                <td>
                  <button type="button" className="btn-close" onClick={() => onClose(p)}>
                    平仓
                  </button>
                </td>
              </tr>
            ))}
            {positions.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  暂无持仓
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
