/**
 * OpenOrders — compact table of PENDING orders for a symbol.
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
      <div className="text-center py-6 text-gray-500 text-sm">
        No pending orders
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
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left px-3 py-2">Symbol</th>
            <th className="text-left px-3 py-2">Side</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Limit</th>
            <th className="text-left px-3 py-2">Age</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {pending.map((o) => (
            <tr key={o._id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
              <td className="px-3 py-2 font-medium text-white">{o.symbol}</td>
              <td className={`px-3 py-2 font-semibold ${o.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                {o.side}
              </td>
              <td className="px-3 py-2 text-right font-mono">{o.qty}</td>
              <td className="px-3 py-2 text-right font-mono">
                {o.limitPricePaise ? formatINR(o.limitPricePaise) : 'MKT'}
              </td>
              <td className="px-3 py-2 text-gray-500">{relativeTime(o.createdAt)}</td>
              <td className="px-3 py-2">
                {confirmId === o._id ? (
                  <span className="flex gap-1">
                    <button
                      onClick={() => handleCancel(o._id)}
                      disabled={cancelling === o._id}
                      className="text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {cancelling === o._id ? '…' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-gray-500 hover:text-gray-300"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmId(o._id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
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
