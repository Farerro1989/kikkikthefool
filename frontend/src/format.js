export const fmtPrice = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '--';
  const v = Number(n);
  const digits = Math.abs(v) < 10 ? 4 : 2;
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const fmtMoney = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '--';
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const fmtQty = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '--';
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 6 });
};

export const fmtTime = (iso) => {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString('zh-CN', { hour12: false });
};

export const STATUS_LABEL = {
  NEW: '接单',
  ACCEPTED: '已接受',
  OPEN: '挂单中',
  PARTIALLY_FILLED: '部分成交',
  FILLED: '已成交',
  CANCEL_REQUESTED: '撤单中',
  CANCELED: '已撤销',
  REJECTED: '已拒绝',
  filled: '已成交',
};

export const badgeClass = (s) =>
  s === 'FILLED'
    ? 'ok'
    : s === 'REJECTED'
      ? 'rejected'
      : s === 'CANCELED'
        ? 'canceled'
        : 'open';

export const KIND_LABEL = {
  FUND: '初始入金',
  FREEZE: '冻结',
  UNFREEZE: '解冻',
  SETTLE: '结算',
};
