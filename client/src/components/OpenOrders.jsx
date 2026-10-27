/**
 * OpenOrders — compact table of PENDING orders in light theme.
 * Props: { symbol, orders, onCancel }
 */
import { useState } from 'react';
import { formatINR } from '../lib/money.js';
import { relativeTime } from '../lib/time.js';

export default function OpenOrders({ symbol, orders = [], onCancel }) {
  const [confirmId, setConfirmId] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const pending = orders.filter(
    (o) => o.status === 'PENDING' && (!symbol || o.symbol === symbol),
  );

  if (pending.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-xs font-mono select-none bg-white">
        No active orders queued in the order book.
      </div>
    );
  }

  async function handleCancel(orderId) {
    setCancelling(orderId);
    try {
      await onCancel?.(orderId);
    } finally {
      setCancelling(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="overflow-x-auto select-none bg-white">
      <table className="w-full text-xs text-left border-collapse">
        <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-xs z-10">
          <tr className="text-slate-500 border-b border-slate-200 text-[11px] font-semibold">
            <th className="px-3 py-2.5">Symbol</th>
            <th className="px-3 py-2.5">Side</th>
            <th className="px-3 py-2.5 text-right">Qty</th>
            <th className="px-3 py-2.5 text-right">Limit Price</th>
            <th className="px-3 py-2.5">Age</th>
            <th className="px-3 py-2.5 text-center">Cancel</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pending.map((o) => (
            <tr key={o._id} className="hover:bg-slate-50/80 transition-colors">
              <td className="px-3 py-2.5 font-bold text-slate-900 tracking-tight">{o.symbol}</td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    o.side === 'BUY'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {o.side}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                {o.qty}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-700 tabular-nums font-semibold">
                {o.limitPricePaise ? formatINR(o.limitPricePaise) : 'MARKET'}
              </td>
              <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px]">
                {relativeTime(o.createdAt)}
              </td>
              <td className="px-3 py-2.5 text-center">
                {confirmId === o._id ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => handleCancel(o._id)}
                      disabled={cancelling === o._id}
                      className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shadow-2xs disabled:opacity-50 transition-colors"
                    >
                      {cancelling === o._id ? '…' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="px-1 py-0.5 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmId(o._id)}
                    className="w-6 h-6 rounded-md hover:bg-slate-100 text-slate-400 hover:text-rose-600 inline-flex items-center justify-center text-xs transition-colors"
                    title="Cancel pending order"
                  >
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
