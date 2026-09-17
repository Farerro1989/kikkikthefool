const handle = async (r) => {
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || '请求失败');
  return data;
};

export const getInstruments = () => fetch('/api/instruments').then(handle);

export const getCandles = (symbol) =>
  fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&limit=240`).then(handle);

export const getAccount = () => fetch('/api/account').then(handle);

export const getPositions = () => fetch('/api/positions').then(handle);

export const getOrders = () => fetch('/api/orders').then(handle);

export const placeOrder = (symbol, side, qty) =>
  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, side, qty }),
  }).then(handle);
