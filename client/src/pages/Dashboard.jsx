/**
 * Dashboard — main trading view.
 * Layout: IndexStrip | [WatchList | CandleChart + OrderPanel]
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Navbar from '../components/Navbar.jsx';
import StatusBar from '../components/StatusBar.jsx';
import IndexStrip from '../components/IndexStrip.jsx';
import WatchList from '../components/WatchList.jsx';
import CandleChart from '../components/CandleChart.jsx';
import OrderPanel from '../components/OrderPanel.jsx';
import { ToastProvider } from '../components/Toasts.jsx';
import { api } from '../lib/api.js';
import { useTicks } from '../hooks/useTicks.js';
import { useSocket } from '../hooks/useSocket.js';
import { formatINR, formatPnl } from '../lib/money.js';
import { ChartSkeleton } from '../components/Skeletons.jsx';

const DEFAULT_SYMBOL = 'RELIANCE';

export default function Dashboard() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [interval, setInterval] = useState('1m');
  const { getTick } = useTicks();
  const { socket } = useSocket();
  const qc = useQueryClient();

  const tick = getTick(symbol);

  // Candle data for the selected symbol + interval
  const { data: candleData, isLoading: candleLoading, refetch: refetchCandles } = useQuery({
    queryKey: ['candles', symbol, interval],
    queryFn: () => api.candles(symbol, interval, 500),
    staleTime: 30_000,
    refetchInterval: interval === '1m' ? false : 60_000,
    enabled: !!symbol,
  });

  // Open orders for the selected symbol (for price lines)
  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'PENDING', symbol],
    queryFn: () => api.listOrders({ status: 'PENDING', symbol, limit: 50 }),
    refetchInterval: 15_000,
  });

  // Trades for the selected symbol (for fill markers)
  const { data: tradesData } = useQuery({
    queryKey: ['trades', symbol],
    queryFn: () => api.listTrades({ symbol, limit: 50 }),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  // Listen for portfolio/order updates from socket
  useEffect(() => {
    if (!socket) return;
    function onPortfolioUpdate() {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['orders', 'PENDING', symbol] });
    }
    function onOrderUpdate() {
      qc.invalidateQueries({ queryKey: ['orders', 'PENDING', symbol] });
      qc.invalidateQueries({ queryKey: ['trades', symbol] });
    }
    function onSessionRestart() {
      // Clear and reload chart on session restart
      refetchCandles();
    }
    socket.on('portfolio:update', onPortfolioUpdate);
    socket.on('order:update', onOrderUpdate);
    socket.on('market:session-restart', onSessionRestart);
    return () => {
      socket.off('portfolio:update', onPortfolioUpdate);
      socket.off('order:update', onOrderUpdate);
      socket.off('market:session-restart', onSessionRestart);
    };
  }, [socket, qc, symbol, refetchCandles]);

  const changePaise = tick ? tick.pricePaise - (tick.prevClosePaise ?? tick.pricePaise) : 0;
  const pnl = formatPnl(changePaise);

  const pendingOrders = ordersData?.orders ?? [];
  const trades = tradesData?.trades ?? [];

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <Navbar />
        <StatusBar />
        <IndexStrip />

        <div className="flex flex-1 overflow-hidden">
          {/* Left: WatchList */}
          <aside className="w-64 shrink-0 border-r border-gray-800 flex flex-col overflow-hidden bg-[#0d1117]">
            <div className="p-3 border-b border-gray-800">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Market Watch</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <WatchList selectedSymbol={symbol} onSelectSymbol={setSymbol} />
            </div>
          </aside>

          {/* Centre: Chart */}
          <main className="flex-1 flex flex-col overflow-hidden bg-[#0a0e1a] p-3 gap-3">
            {/* Symbol header */}
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-bold text-white">{symbol}</h1>
              {tick && (
                <>
                  <span className="text-2xl font-mono font-semibold text-white">
                    {formatINR(tick.pricePaise)}
                  </span>
                  <span className={`text-sm font-medium ${pnl.cls}`}>{pnl.text}</span>
                  <span className={`text-xs ${pnl.cls}`}>
                    ({changePaise >= 0 ? '+' : ''}{tick.prevClosePaise ? ((changePaise / tick.prevClosePaise) * 100).toFixed(2) : 0}%)
                  </span>
                  <span className={`text-xs badge ${tick.source === 'replay' ? 'badge-amber' : tick.source === 'synthetic' ? 'badge-gray' : 'badge-blue'}`}>
                    {tick.source}
                  </span>
                </>
              )}
            </div>

            {/* Chart */}
            <div className="flex-1 min-h-0">
              {candleLoading ? (
                <ChartSkeleton />
              ) : (
                <CandleChart
                  symbol={symbol}
                  initialCandles={candleData?.candles ?? []}
                  formingCandle={candleData?.forming}
                  interval={interval}
                  onIntervalChange={setInterval}
                  pendingOrders={pendingOrders}
                  trades={trades}
                />
              )}
            </div>
          </main>

          {/* Right: Order Panel */}
          <aside className="w-72 shrink-0 border-l border-gray-800 bg-[#0d1117] p-3 overflow-y-auto">
            <OrderPanel
              symbol={symbol}
              pricePaise={tick?.pricePaise}
              onSuccess={() => {
                qc.invalidateQueries({ queryKey: ['orders'] });
                qc.invalidateQueries({ queryKey: ['portfolio'] });
              }}
            />

            {/* Quick stats */}
            {tick && (
              <div className="mt-4 card p-3 space-y-2 text-xs">
                <div className="text-gray-400 font-medium mb-1">Session Stats</div>
                {[
                  ['Open', tick.dayOpenPaise],
                  ['Prev Close', tick.prevClosePaise],
                  ['LTP', tick.pricePaise],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-mono text-white">{val ? formatINR(val) : '—'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Open positions mini-panel */}
            {pendingOrders.length > 0 && (
              <div className="mt-4 card p-3 space-y-1.5 text-xs">
                <div className="text-gray-400 font-medium mb-1">Pending Orders ({pendingOrders.length})</div>
                {pendingOrders.slice(0, 5).map((o) => (
                  <div key={o._id} className="flex justify-between items-center">
                    <span className={o.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                      {o.side} {o.qty}
                    </span>
                    <span className="font-mono text-gray-300">
                      {o.limitPricePaise ? formatINR(o.limitPricePaise) : 'MKT'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </ToastProvider>
  );
}
