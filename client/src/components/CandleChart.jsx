/**
 * CandleChart — lightweight-charts 4.x candlestick chart with:
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
import { formatINR } from '../lib/money.js';
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
    background: { color: '#0f1623' },
    textColor: '#9ca3af',
    fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#1a2030' },
    horzLines: { color: '#1a2030' },
  },
  rightPriceScale: {
    borderColor: '#374151',
    scaleMargins: { top: 0.1, bottom: 0.28 },
  },
  timeScale: {
    borderColor: '#374151',
    timeVisible: true,
    secondsVisible: false,
    fixLeftEdge: false,
    fixRightEdge: false,
  },
  crosshair: {
    vertLine: { color: '#4b5563', style: 0 },
    horzLine: { color: '#4b5563', style: 0 },
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
        right: 66, // leave room for price axis (~60px wide)
        top: Math.round(y),
        transform: 'translateY(-50%)',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-mono shadow-lg ${
          isProfit
            ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-300'
            : 'bg-red-950/95 border-red-500/60 text-red-300'
        }`}
      >
        {/* Quantity */}
        <span className="text-gray-400 font-medium">{qty}×</span>

        {/* Live P&L */}
        <span className="font-semibold">
          {isProfit ? '+' : ''}₹{pnlRupees}
        </span>

        {/* Quick exit button */}
        <button
          onClick={onClose}
          title="Close position at market price"
          className={`ml-0.5 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] transition-colors ${
            isProfit
              ? 'text-emerald-400 hover:bg-emerald-700/60 hover:text-white'
              : 'text-red-400 hover:bg-red-700/60 hover:text-white'
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
  position = null,       // { qty, avgCostPaise, symbol } — null if no position
  onClosePosition = null, // fn(position) — called on quick exit
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeRef = useRef(null);
  // Map orderId -> price line reference (for pending limit orders)
  const priceLinesRef = useRef(new Map());
  // Single price line for position avg cost
  const posLineRef = useRef(null);
  // Last bar bucket index for detecting rollover
  const lastBucketRef = useRef(null);
  // Debounce refetch timer
  const refetchTimerRef = useRef(null);
  // Overlay Y coordinate
  const [overlayY, setOverlayY] = useState(null);

  const { getTick } = useTicks();
  const { socket } = useSocket();
  const currentTick = getTick(symbol);
  const currentPricePaise = currentTick?.pricePaise ?? null;

  // ── Build chart on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      color: '#1f2937',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    // ResizeObserver for responsive sizing
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
      priceLinesRef.current.clear();
      lastBucketRef.current = null;
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);

  // ── Load historical candles ───────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;

    // Clear existing pending price lines when data changes
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
  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove old position line
    if (posLineRef.current) {
      try { seriesRef.current.removePriceLine(posLineRef.current); } catch { /* ignore */ }
      posLineRef.current = null;
    }

    if (position && position.qty > 0) {
      const avgRupees = position.avgCostPaise / 100;
      posLineRef.current = seriesRef.current.createPriceLine({
        price: avgRupees,
        color: '#f59e0b',     // amber — distinct from buy/sell lines
        lineWidth: 1,
        lineStyle: 0,          // solid
        axisLabelVisible: true,
        title: `AVG`,
      });
    }
  }, [position?.avgCostPaise, position?.qty, position?.symbol]);

  // ── Overlay Y coordinate — update on chart scroll/zoom/tick ──────────────
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

  // Subscribe to chart events + poll for smooth updates
  useEffect(() => {
    updateOverlayY();
    if (!chartRef.current) return;

    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(updateOverlayY);
    // Poll every 300ms to keep overlay synced with price scale movements
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

      // Update overlay Y after price scale may have shifted
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
          color: order.side === 'BUY' ? '#22c55e' : '#ef4444',
          lineWidth: 1,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: `${order.side} LMT ${order.qty}`,
        });
        priceLinesRef.current.set(order._id, line);
      } catch { /* series might not be ready */ }
    }
  }, [pendingOrders]);

  // ── Fill markers from trades ──────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !trades?.length) return;

    const ivMs = INTERVAL_MS[interval] ?? INTERVAL_MS['1m'];
    const markers = trades
      .filter((t) => t.executedVts)
      .map((t) => ({
        time: toChartTime(Math.floor(t.executedVts / ivMs) * ivMs),
        position: t.side === 'BUY' ? 'belowBar' : 'aboveBar',
        color: t.side === 'BUY' ? '#22c55e' : '#ef4444',
        shape: t.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${t.side[0]} ${t.qty} @ ${formatINR(t.pricePaise)}`,
        size: 1,
      }))
      .sort((a, b) => a.time - b.time);

    try {
      seriesRef.current.setMarkers(markers);
    } catch { /* ignore */ }
  }, [trades, interval]);

  return (
    <div className="flex flex-col h-full">
      {/* Interval selector */}
      <div className="flex items-center gap-1 mb-2" role="tablist" aria-label="Chart interval">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            role="tab"
            aria-selected={iv === interval}
            onClick={() => onIntervalChange?.(iv)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              iv === interval
                ? 'bg-sky-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {iv}
          </button>
        ))}
      </div>

      {/* Chart container — position:relative for overlay */}
      <div
        ref={containerRef}
        className="flex-1 rounded-lg overflow-hidden relative"
        style={{ minHeight: 320 }}
      >
        {/* Position P&L Overlay */}
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
