import { useMemo, useState } from 'react';
import { KIND_LABEL, fmtDateTime, fmtMoney } from '../format.js';

const FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'FUND', label: '初始入金' },
  { key: 'FREEZE', label: '冻结' },
  { key: 'UNFREEZE', label: '解冻' },
  { key: 'SETTLE', label: '结算' },
];

const badgeClass = { FUND: 'ok', FREEZE: 'open', UNFREEZE: 'unfreeze', SETTLE: 'settle' };

/** 资金流水明细表：记录每笔资金变动（冻结/解冻/结算/入金）及其后的余额快照 */
export default function LedgerTable({ entries }) {
  const [kind, setKind] = useState('ALL');

  const rows = useMemo(
    () => (kind === 'ALL' ? entries : entries.filter((e) => e.kind === kind)),
    [entries, kind],
  );

  return (
    <div>
      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip-btn ${kind === f.key ? 'active' : ''}`}
            onClick={() => setKind(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>类型</th>
            <th>关联订单</th>
            <th>可用变动</th>
            <th>冻结变动</th>
            <th>变动后可用</th>
            <th>变动后冻结</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="cell-sub">{fmtDateTime(e.created_at)}</td>
              <td>
                <span className={`badge ${badgeClass[e.kind] || ''}`}>
                  {KIND_LABEL[e.kind] || e.kind}
                </span>
              </td>
              <td className="cell-sub">{e.order_id ? `#${e.order_id}` : '--'}</td>
              <td className={e.avail_delta >= 0 ? 'up' : 'down'}>
                {e.avail_delta >= 0 ? '+' : ''}
                {fmtMoney(e.avail_delta)}
              </td>
              <td className={e.frozen_delta >= 0 ? 'up' : 'down'}>
                {e.frozen_delta >= 0 ? '+' : ''}
                {fmtMoney(e.frozen_delta)}
              </td>
              <td>{fmtMoney(e.avail_after)}</td>
              <td>{fmtMoney(e.frozen_after)}</td>
              <td className="cell-sub">{e.reason || '--'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">
                暂无资金流水
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
