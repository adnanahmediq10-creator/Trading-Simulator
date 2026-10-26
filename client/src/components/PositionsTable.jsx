/**
 * PositionsTable — shows portfolio positions with live LTP from ticks.
 * Props: { positions, isLoading, onSellClick }
 *   onSellClick(symbol, qty) — called when user clicks the Sell shortcut
 */
import { useTicks } from '../hooks/useTicks.js';
import { TableSkeleton, EmptyState } from './Skeletons.jsx';
import { formatINR, formatPnl } from '../lib/money.js';

export default function PositionsTable({ positions = [], isLoading, onSellClick }) {
  const { getTick } = useTicks();

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
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {openPositions.map((pos) => {
            const tick = getTick(pos.symbol);
            const ltp = tick?.pricePaise ?? pos.ltpPaise ?? pos.avgCostPaise;
            const unrealPnl = (ltp - pos.avgCostPaise) * pos.qty;
            const pnlFmt = formatPnl(unrealPnl);

            return (
              <tr key={pos.symbol} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                <td className="px-3 py-2">
                  <div className="font-medium text-white">{pos.symbol}</div>
                  <div className="text-gray-600">{pos.name}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono">{pos.qty}</td>
                <td className="px-3 py-2 text-right font-mono">{formatINR(pos.avgCostPaise)}</td>
                <td className="px-3 py-2 text-right font-mono text-white">{formatINR(ltp)}</td>
                <td className={`px-3 py-2 text-right font-mono ${pnlFmt.cls}`}>{pnlFmt.text}</td>
                <td className="px-3 py-2">
                  {onSellClick && pos.qty > 0 && (
                    <button
                      onClick={() => onSellClick(pos.symbol, pos.qty)}
                      className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 px-2 py-0.5 rounded transition-colors"
                    >
                      Sell
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
