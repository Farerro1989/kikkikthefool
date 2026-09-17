import { useEffect, useRef } from 'react';
import { ColorType, createChart } from 'lightweight-charts';
import { getCandles } from '../api.js';
import { fmtPrice } from '../format.js';

const POLL_MS = 2000;

export default function ChartPanel({ instrument }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const fitRef = useRef(true);

  // 图表实例只创建一次
  useEffect(() => {
    const el = elRef.current;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0e14' },
        textColor: '#8b95a5',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#151a25' },
        horzLines: { color: '#151a25' },
      },
      rightPriceScale: { borderColor: '#1c2330' },
      timeScale: { borderColor: '#1c2330', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 切换交易对 / 轮询最新 K 线
  useEffect(() => {
    const symbol = instrument?.symbol;
    if (!symbol || !seriesRef.current) return undefined;
    fitRef.current = true;
    let alive = true;
    const load = async () => {
      try {
        const candles = await getCandles(symbol);
        if (!alive || !seriesRef.current) return;
        seriesRef.current.setData(
          candles.map((c) => ({
            time: Math.floor(c.ts / 1000),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        if (fitRef.current) {
          chartRef.current?.timeScale().fitContent();
          fitRef.current = false;
        }
      } catch {
        /* 静默重试 */
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [instrument?.symbol]);

  const chg = instrument?.changePct ?? 0;

  return (
    <div className="panel chart-panel">
      {instrument ? (
        <div className="chart-header">
          <div>
            <div className="chart-title">
              {instrument.symbol}
              <span className="chart-name">{instrument.name}</span>
            </div>
          </div>
          <div className="chart-quote">
            <span className="chart-price">{fmtPrice(instrument.price)}</span>
            <span className={`chart-chg ${chg >= 0 ? 'up' : 'down'}`}>
              {chg >= 0 ? '+' : ''}
              {chg.toFixed(2)}%
            </span>
          </div>
        </div>
      ) : (
        <div className="chart-header">加载中…</div>
      )}
      <div className="chart-body" ref={elRef} />
    </div>
  );
}
