import { fmtMoney, fmtPrice, fmtQty, fmtTime } from '../format.js';

export default function OrdersTable({ orders }) {
  return (
    <div className="panel">
      <h3>成交记录</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>交易对</th>
              <th>方向</th>
              <th>数量</th>
              <th>成交价</th>
              <th>金额</th>
              <th>状态</th>
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
                <td>{fmtPrice(o.price)}</td>
                <td>{fmtMoney(o.qty * o.price)}</td>
                <td>
                  <span className="badge">已成交</span>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  暂无成交
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
