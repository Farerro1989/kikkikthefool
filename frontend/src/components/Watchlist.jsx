import { fmtPrice } from '../format.js';

const KIND_LABEL = {
  crypto: '加密货币',
  stock: '股票',
  forex: '外汇',
  commodity: '商品',
};

export default function Watchlist({ instruments, selected, onSelect }) {
  return (
    <div className="panel watchlist">
      <h3>行情列表</h3>
      <div className="wl-scroll">
        {instruments.map((i) => (
          <button
            key={i.symbol}
            type="button"
            className={`wl-item ${i.symbol === selected ? 'active' : ''}`}
            onClick={() => onSelect(i.symbol)}
          >
            <div className="wl-left">
              <div className="wl-sym">{i.symbol}</div>
              <div className="wl-name">
                {i.name} · {KIND_LABEL[i.kind] || i.kind}
              </div>
            </div>
            <div className="wl-right">
              <div className="wl-price">{fmtPrice(i.price)}</div>
              <div className={`wl-chg ${i.changePct >= 0 ? 'up' : 'down'}`}>
                {i.changePct >= 0 ? '+' : ''}
                {i.changePct.toFixed(2)}%
              </div>
            </div>
          </button>
        ))}
        {instruments.length === 0 && <div className="wl-empty">加载行情中…</div>}
      </div>
    </div>
  );
}
