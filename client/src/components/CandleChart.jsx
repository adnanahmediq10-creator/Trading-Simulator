/**
 * CandleChart — lightweight-charts 4.x candlestick chart with light theme styling:
 *  - Candlestick + volume series
 *  - Live 1-second tick updates
 *  - Pending limit order price lines
 *  - Position avg-cost line with live P&L overlay + quick-exit button
 *  - Interval selector (1m, 5m, 15m, 1D)
 *  - Session-restart reload
 *  - ResizeObserver for responsive sizing
 *
 * Props: { symbol, initialCandles, formingCandle, interval, onIntervalChange,
 *          pendingOrders, position, onClosePosition }
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { toChartTime } from '../lib/time.js';
import { useTicks } from '../hooks/useTicks.js';
import { useSocket } from '../hooks/useSocket.js';

const INTERVALS = ['1m', '5m', '15m', '1D'];

const INTERVAL_MS = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1D': 24 * 60 * 60_000,
};

const CHART_OPTIONS = {
  layout: {
    background: { color: '#ffffff' },
    textColor: '#475569',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#f1f5f9' },
    horzLines: { color: '#f1f5f9' },
  },
  rightPriceScale: {
    borderColor: '#e2e8f0',
    scaleMargins: { top: 0.1, bottom: 0.28 },
  },
  timeScale: {
    borderColor: '#e2e8f0',
    timeVisible: true,
    secondsVisible: false,
    fixLeftEdge: false,
    fixRightEdge: false,
  },
  crosshair: {
    vertLine: { color: '#0284c7', style: 3 },
    horzLine: { color: '#0284c7', style: 3 },
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
};

function toCandleData(c) {
  return {
    time: toChartTime(c.t),
    open: c.o / 100,
    high: c.h / 100,
    low: c.l / 100,
    close: c.c / 100,
  };
}

function toVolumeData(c) {
  return {
    time: toChartTime(c.t),
    value: c.v ?? 0,
    color: c.c >= c.o ? '#16a34a33' : '#dc262633',
  };
}

// ── Position P&L Overlay ──────────────────────────────────────────────────────
function PositionOverlay({ avgCostPaise, qty, currentPricePaise, y, onClose }) {
  if (y === null || y === undefined || qty <= 0) return null;

  const pnlPaise = currentPricePaise
    ? (currentPricePaise - avgCostPaise) * qty
    : 0;
  const isProfit = pnlPaise >= 0;
  const pnlRupees = (pnlPaise / 100).toFixed(0);

  return (
    <div
      style={{
        position: 'absolute',
        right: 68,
        top: Math.round(y),
        transform: 'translateY(-50%)',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      <div
        className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-mono shadow-md backdrop-blur-md ${
          isProfit
            ? 'bg-emerald-50/95 border-emerald-500/70 text-emerald-800'
            : 'bg-rose-50/95 border-rose-500/70 text-rose-800'
        }`}
      >
        <span className="text-slate-500 font-semibold">{qty}×</span>
        <span className="font-bold tabular-nums">
          {isProfit ? '+' : ''}₹{pnlRupees}
        </span>
        <button
          onClick={onClose}
          title="Close position immediately at market price"
          className={`ml-0.5 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] transition-all ${
            isProfit
              ? 'text-emerald-700 hover:bg-emerald-600 hover:text-white'
              : 'text-rose-700 hover:bg-rose-600 hover:text-white'
          }`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function CandleChart({
  symbol,
  initialCandles = [],
  formingCandle,
  interval,
  onIntervalChange,
  pendingOrders = [],
  position = null,
  onClosePosition = null,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeRef = useRef(null);
  const priceLinesRef = useRef(new Map());
  const posLineRef = useRef(null);
  const lastBucketRef = useRef(null);
  const refetchTimerRef = useRef(null);
  const [overlayY, setOverlayY] = useState(null);

  const { getTick } = useTicks();
  const { socket } = useSocket();
  const currentTick = getTick(symbol);
  const currentPricePaise = currentTick?.pricePaise ?? null;

  // ── Build chart on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const priceLines = priceLinesRef.current;
    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      color: '#e2e8f0',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      posLineRef.current = null;
      priceLines.clear();
      lastBucketRef.current = null;
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);

  // ── Load historical candles ───────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;

    priceLinesRef.current.forEach((line) => {
      try { seriesRef.current?.removePriceLine(line); } catch { /* ignore */ }
    });
    priceLinesRef.current.clear();

    if (!initialCandles?.length) {
      seriesRef.current.setData([]);
      volumeRef.current?.setData([]);
      return;
    }

    const data = initialCandles.map(toCandleData).filter(
      (c) => c.open && c.high && c.low && c.close,
    );
    seriesRef.current.setData(data);
    volumeRef.current?.setData(initialCandles.map(toVolumeData));

    if (formingCandle) {
      seriesRef.current.update(toCandleData(formingCandle));
      volumeRef.current?.update(toVolumeData(formingCandle));
    }

    if (data.length > 0) {
      lastBucketRef.current = data[data.length - 1].time;
    }

    chartRef.current?.timeScale().fitContent();
  }, [initialCandles, symbol, interval, formingCandle]);

  // ── Position avg-cost price line ──────────────────────────────────────────
  const positionQty = position?.qty;
  const positionAvgCostPaise = position?.avgCostPaise;
  const positionSymbol = position?.symbol;
  useEffect(() => {
    if (!seriesRef.current) return;

    if (posLineRef.current) {
      try { seriesRef.current.removePriceLine(posLineRef.current); } catch { /* ignore */ }
      posLineRef.current = null;
    }

    if (positionQty > 0) {
      const avgRupees = positionAvgCostPaise / 100;
      posLineRef.current = seriesRef.current.createPriceLine({
        price: avgRupees,
        color: '#d97706',
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `AVG`,
      });
    }
  }, [positionAvgCostPaise, positionQty, positionSymbol]);

  // ── Overlay Y coordinate ──────────────────────────────────────────────────
  const updateOverlayY = useCallback(() => {
    if (!seriesRef.current || !position || position.qty <= 0) {
      setOverlayY(null);
      return;
    }
    try {
      const y = seriesRef.current.priceToCoordinate(position.avgCostPaise / 100);
      setOverlayY(y ?? null);
    } catch {
      setOverlayY(null);
    }
  }, [position]);

  useEffect(() => {
    updateOverlayY();
    if (!chartRef.current) return;

    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(updateOverlayY);
    const id = setInterval(updateOverlayY, 300);

    return () => {
      chartRef.current?.timeScale().unsubscribeVisibleTimeRangeChange(updateOverlayY);
      clearInterval(id);
    };
  }, [updateOverlayY]);

  // ── Update forming candle from ticks ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    function onTicks({ ticks: tickArr }) {
      const tick = tickArr.find((t) => t.symbol === symbol);
      if (!tick || !seriesRef.current) return;

      const ivMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1m'];
      const bucketTime = toChartTime(Math.floor(tick.vts / ivMs) * ivMs);

      const open = tick.bar?.o != null ? tick.bar.o / 100 : tick.pricePaise / 100;
      const high = tick.bar?.h != null ? tick.bar.h / 100 : tick.pricePaise / 100;
      const low = tick.bar?.l != null ? tick.bar.l / 100 : tick.pricePaise / 100;
      const close = tick.pricePaise / 100;

      if (lastBucketRef.current !== null && bucketTime > lastBucketRef.current) {
        lastBucketRef.current = bucketTime;
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = setTimeout(() => {
          containerRef.current?.dispatchEvent(new CustomEvent('chart:refetch'));
        }, 2000);
      }

      try {
        seriesRef.current.update({ time: bucketTime, open, high, low, close });
        volumeRef.current?.update({
          time: bucketTime,
          value: tick.bar?.v ?? 0,
          color: close >= open ? '#16a34a33' : '#dc262633',
        });
      } catch {
        // Ignore out-of-order updates
      }

      updateOverlayY();
    }

    socket.on('ticks', onTicks);
    return () => socket.off('ticks', onTicks);
  }, [socket, symbol, interval, updateOverlayY]);

  // ── Session-restart: clear chart ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    function onSessionRestart() {
      if (seriesRef.current) {
        seriesRef.current.setData([]);
        volumeRef.current?.setData([]);
        lastBucketRef.current = null;
      }
    }
    socket.on('market:session-restart', onSessionRestart);
    return () => socket.off('market:session-restart', onSessionRestart);
  }, [socket]);

  // ── Pending limit order price lines ──────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;

    const pendingIds = new Set(pendingOrders.map((o) => o._id));
    for (const [id, line] of priceLinesRef.current) {
      if (!pendingIds.has(id)) {
        try { seriesRef.current.removePriceLine(line); } catch { /* ignore */ }
        priceLinesRef.current.delete(id);
      }
    }

    for (const order of pendingOrders) {
      if (priceLinesRef.current.has(order._id)) continue;
      if (!order.limitPricePaise) continue;

      try {
        const line = seriesRef.current.createPriceLine({
          price: order.limitPricePaise / 100,
          color: order.side === 'BUY' ? '#16a34a' : '#dc2626',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${order.side} LMT ${order.qty}`,
        });
        priceLinesRef.current.set(order._id, line);
      } catch { /* series might not be ready */ }
    }
  }, [pendingOrders]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 p-2.5 overflow-hidden shadow-2xs">
      {/* Interval Selector Toolbar */}
      <div className="flex items-center justify-between mb-2 px-1" role="tablist" aria-label="Chart interval">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              role="tab"
              aria-selected={iv === interval}
              onClick={() => onIntervalChange?.(iv)}
              className={`px-3 py-1 rounded-md text-xs font-semibold font-mono transition-all ${
                iv === interval
                  ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span>Lightweight Charts™</span>
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 rounded-lg overflow-hidden relative"
        style={{ minHeight: 320 }}
      >
        <PositionOverlay
          avgCostPaise={position?.avgCostPaise}
          qty={position?.qty ?? 0}
          currentPricePaise={currentPricePaise}
          y={overlayY}
          onClose={() => onClosePosition?.(position)}
        />
      </div>
    </div>
  );
}
