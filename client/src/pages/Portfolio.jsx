/**
 * Portfolio page — positions, P&L, equity summary, and account reset.
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
      toast('Account reset successfully.', 'success', 6000);
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
  // Show positions with qty > 0 or realizedPnl != 0
  const positions = portfolio?.positions?.filter((p) => p.qty > 0) ?? [];
  const pnl = totals ? formatPnl(totals.totalPnlPaise) : null;
  const unrealPnl = totals ? formatPnl(totals.unrealizedPnlPaise) : null;
  const realPnl = totals ? formatPnl(totals.realizedPnlPaise) : null;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-6">
        <EmptyState
          icon="⚠️"
          title="Failed to load portfolio"
          description={error.message ?? 'Network error'}
          action={
            <button className="btn-primary" onClick={() => refetch()}>Retry</button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-6 space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-white">Portfolio</h1>
          {pnl && (
            <span className={`text-lg font-mono ${pnl.cls}`}>
              {pnl.text} ({formatPct(totals?.totalPnlPct)})
            </span>
          )}
        </div>
        <button
          id="reset-account-btn"
          onClick={() => setShowResetConfirm(true)}
          className="btn-ghost text-xs text-red-400 hover:text-red-300 border-red-900/50"
        >
          Reset Account
        </button>
      </div>

      {/* Reset confirm dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 className="text-lg font-bold text-white">Reset Account?</h2>
            <p className="text-gray-400 text-sm">
              This will delete all your orders, positions, and trades and restore your cash to
              {` ${formatINR(portfolio?.startingCashPaise)}.`} This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="btn-danger flex-1 disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Yes, Reset'}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-4 h-24 skeleton" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            label="Equity"
            value={formatINRCompact(totals?.equityPaise)}
            sub={`Start: ${formatINRCompact(portfolio?.startingCashPaise)}`}
          />
          <SummaryCard
            label="Cash"
            value={formatINRCompact(portfolio?.cashPaise)}
            sub={`Reserved: ${formatINRCompact(portfolio?.reservedCashPaise)}`}
          />
          <SummaryCard
            label="Unrealised P&L"
            value={unrealPnl?.text}
            cls={unrealPnl?.cls}
          />
          <SummaryCard
            label="Realised P&L"
            value={realPnl?.text}
            cls={realPnl?.cls}
          />
        </div>
      )}

      {/* Positions table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Open Positions</h2>
          <span className="text-xs text-gray-500">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={4} cols={7} /></div>
        ) : positions.length === 0 ? (
          <EmptyState
            icon="📊"
            title="No open positions"
            description="Buy some shares to see your portfolio here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-2">Symbol</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Avg Cost</th>
                  <th className="text-right px-4 py-2">LTP</th>
                  <th className="text-right px-4 py-2">Market Value</th>
                  <th className="text-right px-4 py-2">Unrealised P&L</th>
                  <th className="text-right px-4 py-2">Day Change</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => {
                  // Override LTP with live tick for real-time display
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
                  return (
                    <tr key={pos.symbol} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{pos.symbol}</div>
                        <div className="text-xs text-gray-500">{pos.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {pos.qty}
                        {pos.reservedQty > 0 && (
                          <div className="text-xs text-amber-400">({pos.reservedQty} rsvd)</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatINR(pos.avgCostPaise)}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatINR(ltpPaise)}
                        {pos.priceStale && <span className="text-xs text-amber-400 ml-1">⚠</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatINR(marketValue)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${pnlFmt.cls}`}>
                        {pnlFmt.text}
                        <div className="text-xs">({unrealPct >= 0 ? '+' : ''}{unrealPct.toFixed(2)}%)</div>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${day.cls}`}>{day.text}</td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot className="border-t border-gray-700">
                  <tr className="text-xs font-semibold text-gray-300">
                    <td className="px-4 py-2" colSpan={4}>Total</td>
                    <td className="px-4 py-2 text-right font-mono">{formatINR(totals.marketValuePaise)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${formatPnl(totals.unrealizedPnlPaise).cls}`}>
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

      {/* Realised P&L summary if any */}
      {totals?.realizedPnlPaise !== 0 && totals?.realizedPnlPaise != null && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">Total Realised P&L (all closed trades)</span>
          <span className={`font-mono font-semibold ${formatPnl(totals.realizedPnlPaise).cls}`}>
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
      <div className="flex flex-col min-h-screen bg-[#0a0e1a]">
        <Navbar />
        <StatusBar />
        <PortfolioContent />
      </div>
    </ToastProvider>
  );
}

function SummaryCard({ label, value, sub, cls }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-mono font-semibold ${cls ?? 'text-white'}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}
