export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InstrumentState {
  name: string;
  kind: string;
  volatility: number;
  price: number;
  sessionOpen: number;
  cur: Candle;
}

/** 内存中的实时行情状态（最新价、sessionOpen、进行中的 K 线），重启后从最后一根 K 线恢复 */
export const market = new Map<string, InstrumentState>();
