import { useCallback, useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import Watchlist from './components/Watchlist.jsx';
import ChartPanel from './components/ChartPanel.jsx';
import OrderTicket from './components/OrderTicket.jsx';
import PositionsTable from './components/PositionsTable.jsx';
import OrdersTable from './components/OrdersTable.jsx';
import {
  getAccount,
  getInstruments,
  getOrders,
  getPositions,
  placeOrder,
} from './api.js';

const REFRESH_MS = 2000;

export default function App() {
  const [instruments, setInstruments] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [inst, acct, pos, ord] = await Promise.all([
        getInstruments(),
        getAccount(),
        getPositions(),
        getOrders(),
      ]);
      setInstruments(inst);
      setAccount(acct);
      setPositions(pos);
      setOrders(ord);
      setSelected((s) => s || inst[0]?.symbol || null);
    } catch {
      /* 后端尚未就绪时静默重试 */
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const place = useCallback(
    async (symbol, side, qtyRaw) => {
      const qty = Number(qtyRaw);
      if (!symbol || !Number.isFinite(qty) || qty <= 0) {
        setToast({ type: 'error', msg: '请输入有效数量' });
        return;
      }
      try {
        const order = await placeOrder(symbol, side, qty);
        setToast({
          type: 'ok',
          msg: `${side === 'buy' ? '买入' : '卖出'} ${qty} ${symbol} @ ${Number(order.price).toFixed(4)}`,
        });
        refresh();
      } catch (e) {
        setToast({ type: 'error', msg: e.message });
      }
    },
    [refresh],
  );

  const closePosition = useCallback(
    async (p) => {
      const side = p.qty > 0 ? 'sell' : 'buy';
      try {
        await placeOrder(p.symbol, side, Math.abs(p.qty));
        setToast({ type: 'ok', msg: `已平仓 ${p.symbol}` });
        refresh();
      } catch (e) {
        setToast({ type: 'error', msg: e.message });
      }
    },
    [refresh],
  );

  const instrument = instruments.find((i) => i.symbol === selected) || null;

  return (
    <div className="app">
      <Header account={account} />
      <div className="main-grid">
        <Watchlist instruments={instruments} selected={selected} onSelect={setSelected} />
        <ChartPanel instrument={instrument} />
        <OrderTicket instrument={instrument} onPlace={place} />
      </div>
      <div className="bottom-grid">
        <PositionsTable positions={positions} onClose={closePosition} />
        <OrdersTable orders={orders} />
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
