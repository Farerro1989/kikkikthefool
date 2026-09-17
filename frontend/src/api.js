const handle = async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || '请求失败');
  return data;
};

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(handle);

export const getInstruments = () => fetch('/api/instruments').then(handle);

export const getCandles = (symbol) =>
  fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&limit=240`).then(handle);

export const getAccount = () => fetch('/api/account').then(handle);

export const getPositions = () => fetch('/api/positions').then(handle);

export const getOrders = () => fetch('/api/orders').then(handle);

export const getOpenOrders = () => fetch('/api/orders?status=open').then(handle);

export const getLedger = () => fetch('/api/ledger').then(handle);

export const placeOrder = (payload) => post('/api/orders', payload);

export const cancelOrder = (id) => post(`/api/orders/${id}/cancel`);

export const freezeAccount = (reason) => post('/api/account/freeze', { reason });

export const unfreezeAccount = (reason) => post('/api/account/unfreeze', { reason });

export const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
