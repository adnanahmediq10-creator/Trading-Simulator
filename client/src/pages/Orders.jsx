/**
 * Orders page — order book and trade history with cancel support.
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

const STATUS_COLORS = {
  PENDING: 'badge-amber',
  FILLED: 'badge-green',
  CANCELLED: 'badge-gray',
  REJECTED: 'badge-red',
};

function OrdersContent() {
  const qc = useQueryClient();
  const toast = useToast();
  const { socket } = useSocket();
  const [tab, setTab] = useState('orders'); // 'orders' | 'trades'
  const [statusFilter, setStatusFilter] = useState('');
  // orderId currently awaiting cancel confirmation
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
    onSuccess: (data) => {
      toast(`Order cancelled`, 'success');
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
    <div className="max-w-6xl mx-auto w-full px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Order Book</h1>
        {pendingCount > 0 && (
          <span className="badge-amber">{pendingCount} pending</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {[['orders', 'Orders'], ['trades', 'Trade History']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key ? 'border-sky-500 text-sky-400' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {['', 'PENDING', 'FILLED', 'CANCELLED', 'REJECTED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  statusFilter === s
                    ? 'border-sky-500 text-sky-400 bg-sky-900/30'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            {ordersLoading ? (
              <div className="p-4"><TableSkeleton rows={5} cols={7} /></div>
            ) : orders.length === 0 ? (
              <EmptyState
                icon="📋"
                title="No orders"
                description="Place an order from the Markets page to see it here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-800">
                      <th className="text-left px-4 py-2">Symbol</th>
                      <th className="text-left px-4 py-2">Side</th>
                      <th className="text-left px-4 py-2">Type</th>
                      <th className="text-right px-4 py-2">Qty</th>
                      <th className="text-right px-4 py-2">Price</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2">Time</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o._id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 font-medium text-white">{o.symbol}</td>
                        <td className={`px-4 py-2.5 font-semibold ${o.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {o.side}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{o.type}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{o.qty}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {o.filledPricePaise
                            ? formatINR(o.filledPricePaise)
                            : o.limitPricePaise
                            ? formatINR(o.limitPricePaise)
                            : 'Market'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={STATUS_COLORS[o.status] ?? 'badge-gray'}>{o.status}</span>
                          {o.rejectReason && (
                            <div className="text-xs text-red-400 mt-0.5">{o.rejectReason}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{relativeTime(o.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          {o.status === 'PENDING' && (
                            confirmCancelId === o._id ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => cancelMutation.mutate(o._id)}
                                  disabled={cancelMutation.isPending}
                                  className="text-xs bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded disabled:opacity-50"
                                >
                                  {cancelMutation.isPending ? '…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setConfirmCancelId(null)}
                                  className="text-xs text-gray-400 hover:text-white"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmCancelId(o._id)}
                                className="text-xs text-red-400 hover:text-red-300"
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
        <div className="card overflow-hidden">
          {tradesLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          ) : trades.length === 0 ? (
            <EmptyState
              icon="💹"
              title="No trades yet"
              description="Completed fills will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th className="text-left px-4 py-2">Symbol</th>
                    <th className="text-left px-4 py-2">Side</th>
                    <th className="text-right px-4 py-2">Qty</th>
                    <th className="text-right px-4 py-2">Fill Price</th>
                    <th className="text-right px-4 py-2">P&L</th>
                    <th className="text-left px-4 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => {
                    const pnl = t.side === 'SELL' && t.realizedPnlPaise != null
                      ? formatPnl(t.realizedPnlPaise)
                      : null;
                    return (
                      <tr key={t._id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 font-medium text-white">{t.symbol}</td>
                        <td className={`px-4 py-2.5 font-semibold ${t.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.side}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">{t.qty}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{formatINR(t.pricePaise)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${pnl?.cls ?? 'text-gray-600'}`}>
                          {pnl?.text ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{relativeTime(t.executedAt)}</td>
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
      <div className="flex flex-col min-h-screen bg-[#0a0e1a]">
        <Navbar />
        <StatusBar />
        <OrdersContent />
      </div>
    </ToastProvider>
  );
}
