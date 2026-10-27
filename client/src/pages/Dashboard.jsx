/**
 * Dashboard — main trading terminal view in light theme.
 * Layout: IndexStrip | [WatchList | CandleChart + BottomDock | OrderPanel + Stats]
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
  const { socket, connected } = useSocket();
  const qc = useQueryClient();
  const toast = useToast();

  const tick = getTick(symbol);

  // Candle data
  const { data: candleData, isLoading: candleLoading, refetch: refetchCandles } = useQuery({
    queryKey: ['candles', symbol, chartInterval],
    queryFn: () => api.candles(symbol, chartInterval, 500),
    staleTime: 30_000,
    refetchInterval: connected ? 15_000 : 5_000,
    enabled: !!symbol,
  });

  // All pending orders
  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'PENDING'],
    queryFn: () => api.listOrders({ status: 'PENDING', limit: 100 }),
    refetchInterval: 15_000,
  });

  // Trades for selected symbol
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
      toast('Order successfully cancelled', 'success');
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
  const up = changePaise >= 0;

  const allPendingOrders = ordersData?.orders ?? [];
  const symbolPendingOrders = allPendingOrders.filter((o) => o.symbol === symbol);
  const trades = tradesData?.trades ?? [];
  const positions = portfolioData?.positions ?? [];
  const symbolPosition = positions.find((p) => p.symbol === symbol && p.qty > 0) ?? null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100 select-none">
      <Navbar />
      <StatusBar />
      <IndexStrip />

      {/* Main Multi-Panel Workspace */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Sidebar: Market Watch */}
        <aside className="w-64 shrink-0 border-r border-slate-200 flex flex-col overflow-hidden bg-white shadow-2xs">
          <WatchList selectedSymbol={symbol} onSelectSymbol={setSymbol} />
        </aside>

        {/* Center: Chart + Bottom Tabbed Dock */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-100/60">
          {/* Symbol Quote Header Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white flex-wrap gap-2 shadow-2xs">
            <div className="flex items-baseline gap-3">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{symbol}</h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200">
                  NSE
                </span>
              </div>

              {tick && (
                <>
                  <span className="text-2xl font-mono font-bold text-slate-900 tabular-nums tracking-tight">
                    {formatINR(tick.pricePaise)}
                  </span>

                  <div
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-bold tabular-nums ${
                      up
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    <span>{up ? '▲' : '▼'}</span>
                    <span>{pnl.text}</span>
                    <span>
                      ({up ? '+' : ''}
                      {tick.prevClosePaise
                        ? ((changePaise / tick.prevClosePaise) * 100).toFixed(2)
                        : '0.00'}
                      %)
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Price Feed Source Badge */}
            {tick && (
              <span
                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                  tick.source === 'db'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : tick.source === 'snapshot'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                Feed: {tick.source}
              </span>
            )}
          </div>

          {/* Interactive Candlestick Chart Area */}
          <div className="flex-1 min-h-0 p-3 pb-1">
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

          {/* Bottom Dock: Positions | Orders */}
          <div className="border-t border-slate-200 bg-white flex flex-col shadow-2xs" style={{ height: '32%', minHeight: 130 }}>
            {/* Dock Header Tabs */}
            <div className="flex items-center border-b border-slate-200 px-2 bg-slate-50">
              {BOTTOM_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBottomTab(tab)}
                  className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px flex items-center gap-1.5 ${
                    bottomTab === tab
                      ? 'border-sky-600 text-sky-700 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/70'
                  }`}
                >
                  <span>{tab}</span>
                  {tab === 'Orders' && allPendingOrders.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      {allPendingOrders.length}
                    </span>
                  )}
                  {tab === 'Positions' && positions.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-sky-100 text-sky-800 border border-sky-200">
                      {positions.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Dock Content Scroll Area */}
            <div className="flex-1 overflow-y-auto">
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

        {/* Right Sidebar: Order Execution Ticket & Account Stats */}
        <aside className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto shadow-2xs">
          <div className="p-3.5 space-y-3">
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

            {/* Quick Session Stats Card */}
            {tick && (
              <div className="card p-3.5 space-y-2.5 text-xs bg-white border border-slate-200 shadow-2xs">
                <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  Market Statistics
                </div>
                {[
                  ['Day Open', tick.dayOpenPaise],
                  ['Prev Close', tick.prevClosePaise],
                  ['Last Traded', tick.pricePaise],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">{label}</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {val ? formatINR(val) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Account Buying Power Card */}
            {portfolioData && (
              <div className="card p-3.5 text-xs space-y-2 bg-white border border-slate-200 shadow-2xs">
                <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  Account Summary
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Available Cash</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatINR((portfolioData.cashPaise ?? 0) - (portfolioData.reservedCashPaise ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-500 font-medium">Total Equity</span>
                  <span className="font-mono font-bold text-sky-700 tabular-nums">
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
