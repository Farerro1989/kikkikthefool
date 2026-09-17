import { useEffect, useRef } from 'react';
import { ColorType, createChart } from 'lightweight-charts';

/** 账户资金变动轨迹图：可用/冻结余额随每笔账本分录（冻结/解冻/结算）实时变化 */
export default function BalanceChart({ entries }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const availRef = useRef(null);
  const frozenRef = useRef(null);

  // 图表实例只创建一次
  useEffect(() => {
    const el = elRef.current;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#11151f' },
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
      handleScroll: false,
      handleScale: false,
    });
    availRef.current = chart.addLineSeries({
      color: '#22c55e',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    frozenRef.current = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    chartRef.current = chart;
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      availRef.current = null;
      frozenRef.current = null;
    };
  }, []);

  // 账本分录（倒序）转升序曲线；同秒分录顺延 1 秒保证时间唯一
  useEffect(() => {
    if (!availRef.current || !frozenRef.current) return;
    const avail = [];
    const frozen = [];
    let last = 0;
    for (const e of [...entries].reverse()) {
      let t = Math.floor(new Date(e.created_at).getTime() / 1000);
      if (t <= last) t = last + 1;
      last = t;
      avail.push({ time: t, value: Number(e.avail_after) || 0 });
      frozen.push({ time: t, value: Number(e.frozen_after) || 0 });
    }
    availRef.current.setData(avail);
    frozenRef.current.setData(frozen);
    chartRef.current?.timeScale().fitContent();
  }, [entries]);

  return (
    <div className="balance-chart">
      <div className="balance-chart-header">
        <span className="balance-chart-title">资金变动轨迹</span>
        <span className="balance-chart-legend">
          <span>
            <i className="dot dot-avail" />
            可用余额
          </span>
          <span>
            <i className="dot dot-frozen" />
            冻结余额
          </span>
        </span>
      </div>
      <div className="balance-chart-body" ref={elRef} />
    </div>
  );
}
