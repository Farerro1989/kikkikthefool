import { useState } from 'react';
import { fmtMoney } from '../format.js';

export default function OrderTicket({ instrument, onPlace }) {
  const [qty, setQty] = useState('');
  const price = instrument?.price ?? 0;
  const est = (Number(qty) || 0) * price;

  const submit = (side) => {
    onPlace(instrument?.symbol, side, qty);
  };

  return (
    <div className="panel ticket">
      <h3>市价下单</h3>
      <div className="ticket-body">
        <div className="ticket-symbol">
          <b>{instrument?.symbol || '--'}</b>
          <span>{instrument?.name || ''}</span>
        </div>
        <label className="ticket-label" htmlFor="qty">
          数量
        </label>
        <input
          id="qty"
          type="number"
          min="0"
          step="any"
          placeholder="0.00"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <div className="ticket-est">
          <span>现价</span>
          <b>{price ? fmtMoney(price) : '--'}</b>
        </div>
        <div className="ticket-est">
          <span>预估金额</span>
          <b>{fmtMoney(est)}</b>
        </div>
        <div className="ticket-btns">
          <button type="button" className="btn buy" onClick={() => submit('buy')}>
            买入 / 做多
          </button>
          <button type="button" className="btn sell" onClick={() => submit('sell')}>
            卖出 / 做空
          </button>
        </div>
        <p className="ticket-hint">模拟盘 · 市价即时成交 · 起始资金 100,000</p>
      </div>
    </div>
  );
}
