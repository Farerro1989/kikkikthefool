import { KIND_LABEL, fmtMoney, fmtTime } from '../format.js';

export default function LedgerTable({ entries }) {
  return (
    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>类型</th>
          <th>可用变动</th>
          <th>冻结变动</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td>{fmtTime(e.created_at)}</td>
            <td>
              <span className={`badge ${e.kind === 'SETTLE' ? 'ok' : 'open'}`}>
                {KIND_LABEL[e.kind] || e.kind}
              </span>
            </td>
            <td className={e.avail_delta >= 0 ? 'up' : 'down'}>
              {e.avail_delta >= 0 ? '+' : ''}
              {fmtMoney(e.avail_delta)}
            </td>
            <td className={e.frozen_delta >= 0 ? 'up' : 'down'}>
              {e.frozen_delta >= 0 ? '+' : ''}
              {fmtMoney(e.frozen_delta)}
            </td>
            <td className="cell-sub">{e.reason || '--'}</td>
          </tr>
        ))}
        {entries.length === 0 && (
          <tr>
            <td colSpan={5} className="empty">
              暂无分录
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
