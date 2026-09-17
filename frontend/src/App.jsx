import { useCallback, useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import Watchlist from './components/Watchlist.jsx';
import ChartPanel from './components/ChartPanel.jsx';
import OrderTicket from './components/OrderTicket.jsx';
import PositionsTable from './components/PositionsTable.jsx';
import OrdersTable from './components/OrdersTable.jsx';
import OpenOrdersTable from './components/OpenOrdersTable.jsx';
import LedgerTable from './components/LedgerTable.jsx';
import {
  cancelOrder,
  freezeAccount,
  getAccount,
  getInstruments,
  getLedger,
  getOpenOrders,
  getOrders,
  getPositions,
  placeOrder,
  unfreezeAccount,
  genId,
} from './api.js';

const REFRESH_MS = 2000;

export default function App() {
  const [instruments, setInstruments] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('trades');
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [inst, acct, pos, ord, open, led] = await Promise.all([
        getInstruments(),
        getAccount(),
        getPositions(),
        getOrders(),
        getOpenOrders(),
        getLedger(),
      ]);
      setInstruments(inst);
      setAccount(acct);
      setPositions(pos);
      setOrders(ord);
      setOpenOrders(open);
      setLedger(led);
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

  const notify = useCallback((type, msg) => setToast({ type, msg }), []);

  const place = useCallback(
    async (side, form) => {
      const qty = Number(form.qty);
      if (!selected || !Number.isFinite(qty) || qty <= 0) {
        notify('error', '请输入有效数量');
        return;
      }
      const payload = {
        symbol: selected,
        side,
        qty,
        type: form.type || 'market',
        clientOrderId: genId(),
      };
      if (payload.type === 'limit') {
        const lp = Number(form.limitPrice);
        if (!Number.isFinite(lp) || lp <= 0) {
          notify('error', '请输入有效限价');
          return;
        }
        payload.limitPrice = lp;
      }
      try {
        const r = await placeOrder(payload);
        notify(
          'ok',
          r.duplicated
            ? `重复提交：返回原订单 #${r.id}`
            : `${side === 'buy' ? '买入' : '卖出'} ${qty} ${selected} ${r.status === 'FILLED' ? '已成交' : '已挂单'}`,
        );
        refresh();
      } catch (e) {
        notify('error', e.message);
      }
    },
    [notify, refresh, selected],
  );

  const cancel = useCallback(
    async (id) => {
      try {
        await cancelOrder(id);
        notify('ok', `订单 #${id} 已撤销`);
        refresh();
      } catch (e) {
        notify('error', e.message);
      }
    },
    [notify, refresh],
  );

  const closePosition = useCallback(
    async (p) => {
      try {
        await placeOrder({
          symbol: p.symbol,
          side: p.qty > 0 ? 'sell' : 'buy',
          qty: Math.abs(p.qty),
          type: 'market',
          clientOrderId: genId(),
        });
        notify('ok', `已平仓 ${p.symbol}`);
        refresh();
      } catch (e) {
        notify('error', e.message);
      }
    },
    [notify, refresh],
  );

  const toggleFreeze = useCallback(async () => {
    const active = account?.status === 'ACTIVE';
    try {
      if (active) {
        await freezeAccount('手动冻结（演示）');
        notify('ok', '账户已冻结：禁止下单、撤单与撮合');
      } else {
        await unfreezeAccount('手动解冻（演示）');
        notify('ok', '账户已解冻');
      }
      refresh();
    } catch (e) {
      notify('error', e.message);
    }
  }, [account, notify, refresh]);

  const instrument = instruments.find((i) => i.symbol === selected) || null;

  return (
    <div className="app">
      <Header account={account} onToggleFreeze={toggleFreeze} />
      <div className="main-grid">
        <Watchlist instruments={instruments} selected={selected} onSelect={setSelected} />
        <ChartPanel instrument={instrument} />
        <OrderTicket instrument={instrument} account={account} onPlace={place} />
      </div>
      <div className="bottom-grid">
        <PositionsTable positions={positions} onClose={closePosition} />
        <div className="panel">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${tab === 'trades' ? 'active' : ''}`}
              onClick={() => setTab('trades')}
            >
              订单记录
            </button>
            <button
              type="button"
              className={`tab ${tab === 'open' ? 'active' : ''}`}
              onClick={() => setTab('open')}
            >
              挂单{openOrders.length ? ` (${openOrders.length})` : ''}
            </button>
            <button
              type="button"
              className={`tab ${tab === 'ledger' ? 'active' : ''}`}
              onClick={() => setTab('ledger')}
            >
              账本分录
            </button>
          </div>
          <div className="table-wrap">
            {tab === 'trades' && <OrdersTable orders={orders} />}
            {tab === 'open' && <OpenOrdersTable orders={openOrders} onCancel={cancel} />}
            {tab === 'ledger' && <LedgerTable entries={ledger} />}
          </div>
        </div>
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
