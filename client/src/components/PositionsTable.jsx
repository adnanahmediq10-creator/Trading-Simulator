/**
 * PositionsTable — portfolio positions with live LTP, P&L and close actions in light theme.
 * Props: { positions, isLoading, onSellClick, onClosePosition }
 *   onSellClick(symbol, qty)    — pre-fill order panel with SELL
 *   onClosePosition(position)   — instant MARKET SELL for full qty
 */
import { useState } from 'react';
import { useTicks } from '../hooks/useTicks.js';
import { TableSkeleton, EmptyState } from './Skeletons.jsx';
import { formatINR, formatPnl } from '../lib/money.js';

export default function PositionsTable({ positions = [], isLoading, onSellClick, onClosePosition }) {
  const { getTick } = useTicks();
  const [closingSymbol, setClosingSymbol] = useState(null);

  if (isLoading) {
    return <div className="p-4"><TableSkeleton rows={4} cols={6} /></div>;
  }

  const openPositions = positions.filter((p) => p.qty > 0);

  if (openPositions.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="No active positions"
        description="Execute a buy order from the ticket above to start building your simulated portfolio."
      />
    );
  }

  function handleClose(pos) {
    if (closingSymbol === pos.symbol) {
      setClosingSymbol(null);
      onClosePosition?.(pos);
    } else {
      setClosingSymbol(pos.symbol);
    }
  }

  return (
    <div className="overflow-x-auto select-none bg-white">
      <table className="w-full text-xs text-left border-collapse">
        <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-xs z-10">
          <tr className="text-slate-500 border-b border-slate-200 text-[11px] font-semibold">
            <th className="px-3 py-2.5">Symbol</th>
            <th className="px-3 py-2.5 text-right">Qty</th>
            <th className="px-3 py-2.5 text-right">Avg Cost</th>
            <th className="px-3 py-2.5 text-right">LTP</th>
            <th className="px-3 py-2.5 text-right">Unrealised P&L</th>
            <th className="px-3 py-2.5 text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {openPositions.map((pos) => {
            const tick = getTick(pos.symbol);
            const ltp = tick?.pricePaise ?? pos.ltpPaise ?? pos.avgCostPaise;
            const unrealPnl = (ltp - pos.avgCostPaise) * pos.qty;
            const pnlFmt = formatPnl(unrealPnl);
            const isConfirming = closingSymbol === pos.symbol;
            const isProfit = unrealPnl >= 0;

            return (
              <tr
                key={pos.symbol}
                className="hover:bg-slate-50/80 transition-colors"
              >
                {/* Symbol & Name */}
                <td className="px-3 py-2.5">
                  <div className="font-bold text-slate-900 tracking-tight">{pos.symbol}</div>
                  <div className="text-[10px] text-slate-500 font-medium truncate max-w-[130px]">
                    {pos.name}
                  </div>
                </td>

                {/* Qty */}
                <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                  {pos.qty}
                </td>

                {/* Avg Cost */}
                <td className="px-3 py-2.5 text-right font-mono text-slate-600 tabular-nums font-medium">
                  {formatINR(pos.avgCostPaise)}
                </td>

                {/* LTP */}
                <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                  {formatINR(ltp)}
                </td>

                {/* Unrealised P&L */}
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  <span
                    className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${
                      isProfit
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {pnlFmt.text}
                  </span>
                </td>

                {/* Action Shortcuts */}
                <td className="px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {onSellClick && (
                      <button
                        onClick={() => { setClosingSymbol(null); onSellClick(pos.symbol, pos.qty); }}
                        className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-semibold transition-colors"
                        title="Pre-fill sell order ticket"
                      >
                        Sell
                      </button>
                    )}

                    {onClosePosition && (
                      isConfirming ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleClose(pos)}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shadow-xs transition-colors"
                            title="Confirm immediate market exit"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setClosingSymbol(null)}
                            className="px-1.5 py-1 text-slate-400 hover:text-slate-600 text-xs"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleClose(pos)}
                          className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold transition-colors"
                          title="Instant market close"
                        >
                          Close
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
