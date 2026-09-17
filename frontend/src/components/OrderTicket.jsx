import { useState } from 'react';
import { fmtMoney, fmtPrice } from '../format.js';

export default function OrderTicket({ instrument, account, onPlace }) {
  const [type, setType] = useState('market');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const price = instrument?.price ?? 0;
  const refPrice = type === 'limit' ? Number(limitPrice) || 0 : price;
  const est = (Number(qty) || 0) * refPrice;
  const frozenAccount = account?.status && account.status !== 'ACTIVE';

  const submit = (side) => onPlace(side, { qty, type, limitPrice });

  return (
    <div className="panel ticket">
      <h3>下单</h3>
      <div className="ticket-body">
        <div className="ticket-symbol">
          <b>{instrument?.symbol || '--'}</b>
          <span>{instrument?.name || ''}</span>
        </div>
        <div className="seg">
          <button
            type="button"
            className={type === 'market' ? 'active' : ''}
            onClick={() => setType('market')}
          >
            市价单
          </button>
          <button
            type="button"
            className={type === 'limit' ? 'active' : ''}
            onClick={() => {
              setType('limit');
              if (!limitPrice) setLimitPrice(price ? String(price) : '');
            }}
          >
            限价单
          </button>
        </div>
        {type === 'limit' && (
          <>
            <label className="ticket-label" htmlFor="limitPrice">
              限价
            </label>
            <input
              id="limitPrice"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
            />
          </>
        )}
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
          <span>{type === 'limit' ? '限价' : '现价'}</span>
          <b>{refPrice ? fmtPrice(refPrice) : '--'}</b>
        </div>
        <div className="ticket-est">
          <span>预估金额</span>
          <b>{fmtMoney(est)}</b>
        </div>
        {frozenAccount ? (
          <div className="frozen-note">账户已冻结，暂不可交易</div>
        ) : (
          <div className="ticket-btns">
            <button
              type="button"
              className="btn buy"
              disabled={!instrument}
              onClick={() => submit('buy')}
            >
              买入 / 做多
            </button>
            <button
              type="button"
              className="btn sell"
              disabled={!instrument}
              onClick={() => submit('sell')}
            >
              卖出 / 做空
            </button>
          </div>
        )}
        <p className="ticket-hint">模拟盘 · 幂等下单 · 账务可追溯 · 起始资金 100,000</p>
      </div>
    </div>
  );
}
