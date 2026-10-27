/**
 * Orders page — order book and trade history ledger in light theme.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Navbar from '../components/Navbar.jsx';
import StatusBar from '../components/StatusBar.jsx';
import { ToastProvider, useToast } from '../components/Toasts.jsx';
import { TableSkeleton, EmptyState } from '../components/Skeletons.jsx';
import { api } from '../lib/api.js';
import { useSocket } from '../hooks/useSocket.js';
import { formatINR, formatPnl } from '../lib/money.js';
import { relativeTime } from '../lib/time.js';

const STATUS_BADGES = {
  PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
  FILLED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border border-slate-200',
  REJECTED: 'bg-rose-50 text-rose-700 border border-rose-200',
};

function OrdersContent() {
  const qc = useQueryClient();
  const toast = useToast();
  const { socket } = useSocket();
  const [tab, setTab] = useState('orders');
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: () => api.listOrders({ status: statusFilter || undefined, limit: 100 }),
    refetchInterval: 15_000,
  });

  const { data: tradesData, isLoading: tradesLoading } = useQuery({
    queryKey: ['trades'],
    queryFn: () => api.listTrades({ limit: 100 }),
    enabled: tab === 'trades',
    refetchInterval: 15_000,
  });

  const cancelMutation = useMutation({
    mutationFn: api.cancelOrder,
    onSuccess: () => {
      toast('Order successfully cancelled', 'success');
      setConfirmCancelId(null);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (err) => {
      toast(err.message ?? 'Cancel failed', 'error');
      setConfirmCancelId(null);
    },
  });

  // Socket-driven refresh
  useEffect(() => {
    if (!socket) return;
    function onUpdate() {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['trades'] });
    }
    socket.on('order:update', onUpdate);
    return () => socket.off('order:update', onUpdate);
  }, [socket, qc]);

  const orders = ordersData?.orders ?? [];
  const trades = tradesData?.trades ?? [];
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5 select-none">
      {/* Title & Stats */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            Order Book & Fills
            {pendingCount > 0 && (
              <span className="badge-amber text-xs font-mono font-bold px-2 py-0.5">
                {pendingCount} Pending
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Real-time simulated execution log and order management.
          </p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          ['orders', 'Order Book'],
          ['trades', 'Trade History'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px flex items-center gap-2 ${
              tab === key
                ? 'border-sky-600 text-sky-700 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
            {key === 'orders' && orders.length > 0 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {orders.length}
              </span>
            )}
            {key === 'trades' && trades.length > 0 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {trades.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          {/* Status Filter Chips */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Filter:
            </span>
            {['', 'PENDING', 'FILLED', 'CANCELLED', 'REJECTED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-all ${
                  statusFilter === s
                    ? 'border-sky-500 bg-sky-50 text-sky-700 font-bold shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {s || 'All Orders'}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden bg-white border border-slate-200 shadow-2xs">
            {ordersLoading ? (
              <div className="p-5">
                <TableSkeleton rows={5} cols={7} />
              </div>
            ) : orders.length === 0 ? (
              <EmptyState
                icon="📋"
                title="No orders found"
                description="Orders placed on the market view will appear here in real time."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50">
                    <tr className="text-slate-500 border-b border-slate-200 font-semibold text-[11px]">
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3">Side</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Execution Price</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                      <tr key={o._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900 tracking-tight">{o.symbol}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              o.side === 'BUY'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {o.side}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500 font-semibold">{o.type}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {o.qty}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-800 tabular-nums">
                          {o.filledPricePaise
                            ? formatINR(o.filledPricePaise)
                            : o.limitPricePaise
                            ? formatINR(o.limitPricePaise)
                            : 'Market'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              STATUS_BADGES[o.status] ?? 'badge-gray'
                            }`}
                          >
                            {o.status}
                          </span>
                          {o.rejectReason && (
                            <div className="text-[10px] text-rose-600 font-medium mt-1">
                              {o.rejectReason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {relativeTime(o.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {o.status === 'PENDING' && (
                            confirmCancelId === o._id ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => cancelMutation.mutate(o._id)}
                                  disabled={cancelMutation.isPending}
                                  className="text-[10px] bg-rose-600 hover:bg-rose-500 text-white font-bold px-2 py-1 rounded shadow-2xs disabled:opacity-50 transition-colors"
                                >
                                  {cancelMutation.isPending ? '…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setConfirmCancelId(null)}
                                  className="text-xs text-slate-400 hover:text-slate-600 px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmCancelId(o._id)}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded border border-rose-200 transition-colors"
                              >
                                Cancel
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'trades' && (
        <div className="card overflow-hidden bg-white border border-slate-200 shadow-2xs">
          {tradesLoading ? (
            <div className="p-5">
              <TableSkeleton rows={5} cols={6} />
            </div>
          ) : trades.length === 0 ? (
            <EmptyState
              icon="💹"
              title="No executed trades yet"
              description="Completed fills and executed limit orders will be archived here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50">
                  <tr className="text-slate-500 border-b border-slate-200 font-semibold text-[11px]">
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Side</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Fill Price</th>
                    <th className="px-4 py-3 text-right">Realised P&L</th>
                    <th className="px-4 py-3">Execution Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trades.map((t) => {
                    const pnl = t.side === 'SELL' && t.realizedPnlPaise != null
                      ? formatPnl(t.realizedPnlPaise)
                      : null;
                    const isProfit = t.realizedPnlPaise != null && t.realizedPnlPaise >= 0;

                    return (
                      <tr key={t._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900 tracking-tight">{t.symbol}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.side === 'BUY'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {t.side}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {t.qty}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-800 tabular-nums">
                          {formatINR(t.pricePaise)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {pnl ? (
                            <span
                              className={`inline-flex font-bold px-2 py-0.5 rounded text-[11px] ${
                                isProfit
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {pnl.text}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {relativeTime(t.executedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen bg-slate-50">
        <Navbar />
        <StatusBar />
        <OrdersContent />
      </div>
    </ToastProvider>
  );
}
