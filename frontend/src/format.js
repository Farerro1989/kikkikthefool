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
