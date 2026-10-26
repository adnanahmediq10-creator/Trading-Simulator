/**
 * PositionsTable — portfolio positions with live LTP, P&L and close actions.
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
  const [closingSymbol, setClosingSymbol] = useState(null); // confirm state

  if (isLoading) {
    return <div className="p-4"><TableSkeleton rows={4} cols={6} /></div>;
  }

  const openPositions = positions.filter((p) => p.qty > 0);

  if (openPositions.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="No open positions"
        description="Buy some shares to see your positions here."
      />
    );
  }

  function handleClose(pos) {
    if (closingSymbol === pos.symbol) {
      // Confirmed — execute
      setClosingSymbol(null);
      onClosePosition?.(pos);
    } else {
      setClosingSymbol(pos.symbol);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left px-3 py-2">Symbol</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Avg Cost</th>
            <th className="text-right px-3 py-2">LTP</th>
            <th className="text-right px-3 py-2">Unrealised P&L</th>
            <th className="px-3 py-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {openPositions.map((pos) => {
            const tick = getTick(pos.symbol);
            const ltp = tick?.pricePaise ?? pos.ltpPaise ?? pos.avgCostPaise;
            const unrealPnl = (ltp - pos.avgCostPaise) * pos.qty;
            const pnlFmt = formatPnl(unrealPnl);
            const isConfirming = closingSymbol === pos.symbol;

            return (
              <tr
                key={pos.symbol}
                className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors"
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-white">{pos.symbol}</div>
                  <div className="text-gray-600">{pos.name}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-white">{pos.qty}</td>
                <td className="px-3 py-2 text-right font-mono">{formatINR(pos.avgCostPaise)}</td>
                <td className="px-3 py-2 text-right font-mono text-white">{formatINR(ltp)}</td>
                <td className={`px-3 py-2 text-right font-mono ${pnlFmt.cls}`}>{pnlFmt.text}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    {/* Sell shortcut — pre-fills order panel */}
                    {onSellClick && (
                      <button
                        onClick={() => { setClosingSymbol(null); onSellClick(pos.symbol, pos.qty); }}
                        className="text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-900/20 px-2 py-0.5 rounded transition-colors"
                        title="Pre-fill sell order"
                      >
                        Sell
                      </button>
                    )}

                    {/* Close position — market sell full qty */}
                    {onClosePosition && (
                      isConfirming ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleClose(pos)}
                            className="text-xs text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 px-2 py-0.5 rounded transition-colors font-medium"
                            title="Confirm market close"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setClosingSymbol(null)}
                            className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded"
                          >
                            ✕
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleClose(pos)}
                          className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 px-2 py-0.5 rounded transition-colors border border-red-800/40 hover:border-red-600/60"
                          title="Close full position at market"
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
