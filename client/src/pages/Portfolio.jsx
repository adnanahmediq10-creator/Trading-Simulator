/**
 * Portfolio page — positions, P&L, equity summary, and account reset in light theme.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Navbar from '../components/Navbar.jsx';
import StatusBar from '../components/StatusBar.jsx';
import { ToastProvider, useToast } from '../components/Toasts.jsx';
import { TableSkeleton, EmptyState } from '../components/Skeletons.jsx';
import { api } from '../lib/api.js';
import { useSocket } from '../hooks/useSocket.js';
import { useTicks } from '../hooks/useTicks.js';
import { formatINR, formatINRCompact, formatPnl, formatPct } from '../lib/money.js';

function PortfolioContent() {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const { getTick } = useTicks();
  const toast = useToast();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolio'],
    queryFn: api.portfolio,
    refetchInterval: 10_000,
  });

  const resetMutation = useMutation({
    mutationFn: api.resetAccount,
    onSuccess: () => {
      toast('Account successfully reset to starting balance', 'success', 6000);
      setShowResetConfirm(false);
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (err) => toast(err.message ?? 'Reset failed', 'error'),
  });

  useEffect(() => {
    if (!socket) return;
    function onUpdate() { qc.invalidateQueries({ queryKey: ['portfolio'] }); }
    socket.on('portfolio:update', onUpdate);
    socket.on('order:update', onUpdate);
    return () => {
      socket.off('portfolio:update', onUpdate);
      socket.off('order:update', onUpdate);
    };
  }, [socket, qc]);

  const portfolio = data;
  const totals = portfolio?.totals;
  const positions = portfolio?.positions?.filter((p) => p.qty > 0) ?? [];
  const pnl = totals ? formatPnl(totals.totalPnlPaise) : null;
  const unrealPnl = totals ? formatPnl(totals.unrealizedPnlPaise) : null;
  const realPnl = totals ? formatPnl(totals.realizedPnlPaise) : null;
  const isNetProfit = totals ? totals.totalPnlPaise >= 0 : true;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-8">
        <EmptyState
          icon="⚠️"
          title="Portfolio Synchronization Failure"
          description={error.message ?? 'Network error connecting to the portfolio service.'}
          action={
            <button className="btn-primary" onClick={() => refetch()}>
              Retry Connection
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 select-none">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Portfolio</h1>
          {pnl && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-mono font-bold tabular-nums ${
                isNetProfit
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span>{isNetProfit ? '▲' : '▼'}</span>
              <span>{pnl.text}</span>
              <span>({formatPct(totals?.totalPnlPct)})</span>
            </div>
          )}
        </div>
        <button
          id="reset-account-btn"
          onClick={() => setShowResetConfirm(true)}
          className="btn-ghost text-xs text-rose-600 hover:text-rose-700 border-rose-200 hover:bg-rose-50 self-start sm:self-auto font-semibold"
        >
          Reset Simulation Balance
        </button>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card-elevated p-6 max-w-sm w-full space-y-4 shadow-xl border-slate-200 animate-slide-up bg-white">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Reset Simulation Account?</h2>
              <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                This action will delete all existing orders, positions, and trades, restoring your buying power to
                <span className="font-bold text-slate-900 font-mono"> {formatINR(portfolio?.startingCashPaise)}. </span>
                This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="btn-danger flex-1 py-2 text-xs font-bold"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Yes, Reset Funds'}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-ghost flex-1 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Metric Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-5 h-24 skeleton" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <SummaryCard
            label="Total Equity"
            value={formatINRCompact(totals?.equityPaise)}
            sub={`Baseline: ${formatINRCompact(portfolio?.startingCashPaise)}`}
            accentColor="text-sky-700"
          />
          <SummaryCard
            label="Available Cash"
            value={formatINRCompact(portfolio?.cashPaise)}
            sub={`Reserved: ${formatINRCompact(portfolio?.reservedCashPaise)}`}
            accentColor="text-slate-900"
          />
          <SummaryCard
            label="Unrealised P&L"
            value={unrealPnl?.text}
            cls={unrealPnl?.cls}
            isPnl
          />
          <SummaryCard
            label="Realised P&L"
            value={realPnl?.text}
            cls={realPnl?.cls}
            isPnl
          />
        </div>
      )}

      {/* Holdings & Positions Table */}
      <div className="card overflow-hidden bg-white border border-slate-200 shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-900 text-sm tracking-tight">Active Holdings</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
              {positions.length}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium">Mark-to-Market Realtime</span>
        </div>

        {isLoading ? (
          <div className="p-5"><TableSkeleton rows={4} cols={7} /></div>
        ) : positions.length === 0 ? (
          <EmptyState
            icon="📊"
            title="No securities in portfolio"
            description="Acquire shares through the market terminal to track positions and P&L here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-slate-500 border-b border-slate-200 font-semibold text-[11px]">
                  <th className="px-5 py-3">Symbol</th>
                  <th className="px-5 py-3 text-right">Holding Qty</th>
                  <th className="px-5 py-3 text-right">Avg Cost</th>
                  <th className="px-5 py-3 text-right">LTP</th>
                  <th className="px-5 py-3 text-right">Market Value</th>
                  <th className="px-5 py-3 text-right">Unrealised P&L</th>
                  <th className="px-5 py-3 text-right">Day Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {positions.map((pos) => {
                  const tick = getTick(pos.symbol);
                  const ltpPaise = tick?.pricePaise ?? pos.ltpPaise;
                  const marketValue = ltpPaise * pos.qty;
                  const unrealPnlPaise = (ltpPaise - pos.avgCostPaise) * pos.qty;
                  const unrealPct = pos.avgCostPaise > 0
                    ? ((ltpPaise - pos.avgCostPaise) / pos.avgCostPaise * 100)
                    : 0;
                  const dayChangePaise = tick
                    ? (tick.pricePaise - (tick.prevClosePaise ?? tick.pricePaise)) * pos.qty
                    : pos.dayChangePaise;

                  const pnlFmt = formatPnl(unrealPnlPaise);
                  const day = formatPnl(dayChangePaise);
                  const isProfit = unrealPnlPaise >= 0;

                  return (
                    <tr key={pos.symbol} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 tracking-tight">{pos.symbol}</div>
                        <div className="text-[10px] text-slate-500 font-medium truncate max-w-[140px] mt-0.5">
                          {pos.name}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {pos.qty}
                        {pos.reservedQty > 0 && (
                          <div className="text-[10px] text-amber-700 font-semibold">({pos.reservedQty} locked)</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-slate-700 tabular-nums font-semibold">
                        {formatINR(pos.avgCostPaise)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {formatINR(ltpPaise)}
                        {pos.priceStale && <span className="text-[10px] text-amber-600 ml-1 font-bold" title="Price stale">⚠</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-800 tabular-nums">
                        {formatINR(marketValue)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                        <span
                          className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${
                            isProfit
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {pnlFmt.text}
                          <span className="text-[10px] opacity-80">
                            ({unrealPct >= 0 ? '+' : ''}{unrealPct.toFixed(2)}%)
                          </span>
                        </span>
                      </td>
                      <td className={`px-5 py-3.5 text-right font-mono font-bold tabular-nums ${day.cls}`}>
                        {day.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr className="text-xs font-bold text-slate-700">
                    <td className="px-5 py-3" colSpan={4}>Aggregate Portfolio Value</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatINR(totals.marketValuePaise)}
                    </td>
                    <td className={`px-5 py-3 text-right font-mono font-bold tabular-nums ${formatPnl(totals.unrealizedPnlPaise).cls}`}>
                      {formatPnl(totals.unrealizedPnlPaise).text}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Closed Positions Realised P&L Banner */}
      {totals?.realizedPnlPaise !== 0 && totals?.realizedPnlPaise != null && (
        <div className="card p-4 flex items-center justify-between border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">
              Cumulative Realised P&L
            </span>
            <span className="text-[10px] text-slate-400 font-medium">(All Closed Cycles)</span>
          </div>
          <span className={`font-mono font-bold text-sm tabular-nums ${formatPnl(totals.realizedPnlPaise).cls}`}>
            {formatPnl(totals.realizedPnlPaise).text}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Portfolio() {
  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen bg-slate-50">
        <Navbar />
        <StatusBar />
        <PortfolioContent />
      </div>
    </ToastProvider>
  );
}

function SummaryCard({ label, value, sub, cls, accentColor }) {
  return (
    <div className="card p-4 space-y-1 bg-white border border-slate-200 shadow-2xs">
      <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-mono font-bold tracking-tight tabular-nums ${cls ?? accentColor ?? 'text-slate-900'}`}>
        {value ?? '—'}
      </div>
      {sub && <div className="text-[10px] text-slate-400 font-mono mt-0.5 font-medium">{sub}</div>}
    </div>
  );
}
