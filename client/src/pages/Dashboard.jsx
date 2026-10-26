/**
 * Dashboard — main trading view.
 * Layout: IndexStrip | [WatchList | CandleChart + OrderPanel] | BottomBar
 */
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import Navbar from '../components/Navbar.jsx';
import StatusBar from '../components/StatusBar.jsx';
import IndexStrip from '../components/IndexStrip.jsx';
import WatchList from '../components/WatchList.jsx';
import CandleChart from '../components/CandleChart.jsx';
import OrderPanel from '../components/OrderPanel.jsx';
import PositionsTable from '../components/PositionsTable.jsx';
import OpenOrders from '../components/OpenOrders.jsx';
import { ToastProvider, useToast } from '../components/Toasts.jsx';
import { api } from '../lib/api.js';
import { useTicks } from '../hooks/useTicks.js';
import { useSocket } from '../hooks/useSocket.js';
import { formatINR, formatPnl } from '../lib/money.js';
import { ChartSkeleton } from '../components/Skeletons.jsx';

const DEFAULT_SYMBOL = 'RELIANCE';
const BOTTOM_TABS = ['Positions', 'Orders'];

function DashboardContent() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [chartInterval, setChartInterval] = useState('1m');
  const [bottomTab, setBottomTab] = useState('Positions');
  const [prefillSide, setPrefillSide] = useState(null);
  const [prefillQty, setPrefillQty] = useState('');
  const { getTick } = useTicks();
  const { socket } = useSocket();
  const qc = useQueryClient();
  const toast = useToast();

  const tick = getTick(symbol);

  // Candle data
  const { data: candleData, isLoading: candleLoading, refetch: refetchCandles } = useQuery({
    queryKey: ['candles', symbol, chartInterval],
    queryFn: () => api.candles(symbol, chartInterval, 500),
    staleTime: 30_000,
    refetchInterval: chartInterval === '1m' ? false : 60_000,
    enabled: !!symbol,
  });

  // All pending orders (for price lines on chart and bottom panel)
  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'PENDING'],
    queryFn: () => api.listOrders({ status: 'PENDING', limit: 100 }),
    refetchInterval: 15_000,
  });

  // Trades for selected symbol (fill markers)
  const { data: tradesData } = useQuery({
    queryKey: ['trades', symbol],
    queryFn: () => api.listTrades({ symbol, limit: 50 }),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  // Portfolio positions
  const { data: portfolioData, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: api.portfolio,
    refetchInterval: 10_000,
  });

  const cancelMutation = useMutation({
    mutationFn: api.cancelOrder,
    onSuccess: () => {
      toast('Order cancelled', 'success');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
    onError: (err) => toast(err.message ?? 'Cancel failed', 'error'),
  });

  // Socket-driven invalidations
  useEffect(() => {
    if (!socket) return;
    function onPortfolioUpdate() {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['orders', 'PENDING'] });
    }
    function onOrderUpdate() {
      qc.invalidateQueries({ queryKey: ['orders', 'PENDING'] });
      qc.invalidateQueries({ queryKey: ['trades', symbol] });
    }
    function onSessionRestart() {
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

  // When user clicks "Sell" on a position, pre-fill the order panel
  const handleSellShortcut = useCallback((sym, qty) => {
    setSymbol(sym);
    setPrefillSide('SELL');
    setPrefillQty(String(qty));
  }, []);

  // Close a full position instantly via MARKET SELL
  const handleClosePosition = useCallback(async (pos) => {
    try {
      await api.placeOrder(
        { symbol: pos.symbol, side: 'SELL', type: 'MARKET', qty: pos.qty },
        uuidv4(),
      );
      toast(`Closing ${pos.qty} × ${pos.symbol} at market…`, 'success');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['trades', symbol] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch (err) {
      toast(err.message ?? 'Close position failed', 'error');
    }
  }, [qc, toast, symbol]);

  const changePaise = tick ? tick.pricePaise - (tick.prevClosePaise ?? tick.pricePaise) : 0;
  const pnl = formatPnl(changePaise);

  const allPendingOrders = ordersData?.orders ?? [];
  const symbolPendingOrders = allPendingOrders.filter((o) => o.symbol === symbol);
  const trades = tradesData?.trades ?? [];
  const positions = portfolioData?.positions ?? [];
  // Current symbol's open position (for chart overlay)
  const symbolPosition = positions.find((p) => p.symbol === symbol && p.qty > 0) ?? null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <StatusBar />
      <IndexStrip />

      {/* Main trading area */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left: WatchList */}
        <aside className="w-60 shrink-0 border-r border-gray-800 flex flex-col overflow-hidden bg-[#0d1117]">
          <div className="px-3 py-2 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Market Watch</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <WatchList selectedSymbol={symbol} onSelectSymbol={setSymbol} />
          </div>
        </aside>

        {/* Centre: Chart + bottom panel */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0a0e1a] min-w-0">
          {/* Symbol header */}
          <div className="flex items-baseline gap-3 px-4 pt-3 pb-1 flex-wrap">
            <h1 className="text-xl font-bold text-white">{symbol}</h1>
            {tick && (
              <>
                <span className="text-2xl font-mono font-semibold text-white">
                  {formatINR(tick.pricePaise)}
                </span>
                <span className={`text-sm font-medium ${pnl.cls}`}>{pnl.text}</span>
                <span className={`text-xs ${pnl.cls}`}>
                  ({changePaise >= 0 ? '+' : ''}
                  {tick.prevClosePaise
                    ? ((changePaise / tick.prevClosePaise) * 100).toFixed(2)
                    : 0}
                  %)
                </span>
                <span className={`text-xs badge ${
                  tick.source === 'db' ? 'badge-blue' :
                  tick.source === 'snapshot' ? 'badge-amber' : 'badge-gray'
                }`}>
                  {tick.source}
                </span>
              </>
            )}
          </div>

          {/* Chart — takes 60% of remaining height */}
          <div className="flex-1 min-h-0 px-3 pb-1">
            {candleLoading ? (
              <ChartSkeleton />
            ) : (
              <CandleChart
                symbol={symbol}
                initialCandles={candleData?.candles ?? []}
                formingCandle={candleData?.forming}
                interval={chartInterval}
                onIntervalChange={setChartInterval}
                pendingOrders={symbolPendingOrders}
                trades={trades}
                position={symbolPosition}
                onClosePosition={handleClosePosition}
              />
            )}
          </div>

          {/* Bottom tabs: Positions | Orders */}
          <div className="border-t border-gray-800 bg-[#0d1117]" style={{ maxHeight: '30%', minHeight: 120 }}>
            <div className="flex items-center gap-0 border-b border-gray-800">
              {BOTTOM_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBottomTab(tab)}
                  className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    bottomTab === tab
                      ? 'border-sky-500 text-sky-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab}
                  {tab === 'Orders' && allPendingOrders.length > 0 && (
                    <span className="ml-1.5 badge-amber text-xs">{allPendingOrders.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(30vh - 30px)' }}>
              {bottomTab === 'Positions' ? (
                <PositionsTable
                  positions={positions}
                  isLoading={portfolioLoading}
                  onSellClick={handleSellShortcut}
                  onClosePosition={handleClosePosition}
                />
              ) : (
                <OpenOrders
                  orders={allPendingOrders}
                  onCancel={cancelMutation.mutateAsync}
                />
              )}
            </div>
          </div>
        </main>

        {/* Right: Order Panel */}
        <aside className="w-72 shrink-0 border-l border-gray-800 bg-[#0d1117] overflow-y-auto">
          <div className="p-3">
            <OrderPanel
              symbol={symbol}
              pricePaise={tick?.pricePaise}
              prefillSide={prefillSide}
              prefillQty={prefillQty}
              onPrefillConsumed={() => { setPrefillSide(null); setPrefillQty(''); }}
              onSuccess={() => {
                qc.invalidateQueries({ queryKey: ['orders'] });
                qc.invalidateQueries({ queryKey: ['portfolio'] });
              }}
            />

            {/* Quick stats */}
            {tick && (
              <div className="mt-3 card p-3 space-y-2 text-xs">
                <div className="text-gray-400 font-medium mb-1">Session</div>
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

            {/* Cash available */}
            {portfolioData && (
              <div className="mt-3 card p-3 text-xs">
                <div className="text-gray-400 font-medium mb-2">Account</div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Available Cash</span>
                  <span className="font-mono text-white">
                    {formatINR((portfolioData.cashPaise ?? 0) - (portfolioData.reservedCashPaise ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Equity</span>
                  <span className="font-mono text-white">
                    {formatINR(portfolioData.totals?.equityPaise ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <ToastProvider>
      <DashboardContent />
    </ToastProvider>
  );
}
