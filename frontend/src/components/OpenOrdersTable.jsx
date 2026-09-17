import { STATUS_LABEL, badgeClass, fmtPrice, fmtQty, fmtTime } from '../format.js';

export default function OpenOrdersTable({ orders, onCancel }) {
  return (
    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>交易对</th>
          <th>方向</th>
          <th>数量</th>
          <th>限价</th>
          <th>状态</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>{fmtTime(o.created_at)}</td>
            <td>
              <b>{o.symbol}</b>
            </td>
            <td className={o.side === 'buy' ? 'up' : 'down'}>
              {o.side === 'buy' ? '买入' : '卖出'}
            </td>
            <td>{fmtQty(o.qty)}</td>
            <td>{fmtPrice(o.limit_price)}</td>
            <td>
              <span className={`badge ${badgeClass(o.status)}`}>
                {STATUS_LABEL[o.status] || o.status}
              </span>
            </td>
            <td>
              <button type="button" className="btn-close" onClick={() => onCancel(o.id)}>
                撤单
              </button>
            </td>
          </tr>
        ))}
        {orders.length === 0 && (
          <tr>
            <td colSpan={7} className="empty">
              暂无挂单
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
