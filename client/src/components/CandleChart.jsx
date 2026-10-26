/**
 * CandleChart — lightweight-charts 4.x candlestick chart with:
 *  - Candlestick + volume series
 *  - Live 1-second tick updates
 *  - Pending limit order price lines
 *  - Fill markers from trade history
 *  - Interval selector (1m, 5m, 15m, 1D)
 *  - Session-restart reload
 *  - ResizeObserver for responsive sizing
 *
 * Props: { symbol, initialCandles, formingCandle, interval, onIntervalChange,
 *          pendingOrders, trades }
 */
import { useEffect, useRef, useCallback } from 'react';
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

export default function CandleChart({
  symbol,
  initialCandles = [],
  formingCandle,
  interval,
  onIntervalChange,
  pendingOrders = [],
  trades = [],
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeRef = useRef(null);
  // Map orderId -> price line reference
  const priceLinesRef = useRef(new Map());
  // Last bar bucket index for detecting rollover
  const lastBucketRef = useRef(null);
  // Debounce refetch timer
  const refetchTimerRef = useRef(null);

  const { socket } = useSocket();
  useTicks(); // keep ticks flowing

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
      priceLinesRef.current.clear();
      lastBucketRef.current = null;
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);

  // ── Load historical candles ───────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;

    // Clear existing price lines when data changes
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

    // Record last bucket for rollover detection
    if (data.length > 0) {
      lastBucketRef.current = data[data.length - 1].time;
    }

    chartRef.current?.timeScale().fitContent();
  }, [initialCandles, symbol, interval, formingCandle]);

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

      // Detect bar rollover
      if (lastBucketRef.current !== null && bucketTime > lastBucketRef.current) {
        // New bucket started — update then debounce a refetch to reconcile
        lastBucketRef.current = bucketTime;
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = setTimeout(() => {
          // Signal parent to refetch candles — via a custom event
          containerRef.current?.dispatchEvent(new CustomEvent('chart:refetch'));
        }, 2000);
      }

      try {
        seriesRef.current.update({
          time: bucketTime,
          open,
          high,
          low,
          close,
        });
        volumeRef.current?.update({
          time: bucketTime,
          value: tick.bar?.v ?? 0,
          color: close >= open ? '#16a34a33' : '#dc262633',
        });
      } catch {
        // Ignore out-of-order updates
      }
    }

    socket.on('ticks', onTicks);
    return () => socket.off('ticks', onTicks);
  }, [socket, symbol, interval]);

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

    // Remove lines for orders no longer pending
    const pendingIds = new Set(pendingOrders.map((o) => o._id));
    for (const [id, line] of priceLinesRef.current) {
      if (!pendingIds.has(id)) {
        try { seriesRef.current.removePriceLine(line); } catch { /* ignore */ }
        priceLinesRef.current.delete(id);
      }
    }

    // Add lines for new pending orders
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
      // Sort by time ascending (required by lightweight-charts)
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

      {/* Chart container */}
      <div
        ref={containerRef}
        className="flex-1 rounded-lg overflow-hidden"
        style={{ minHeight: 320 }}
      />
    </div>
  );
}
