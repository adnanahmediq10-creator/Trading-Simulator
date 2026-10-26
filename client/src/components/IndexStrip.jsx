/**
 * IndexStrip — horizontal strip showing 3 market indices with live price + change.
 * Shows NIFTY50, SENSEX, BANKNIFTY.
 */
import { useQuery } from '@tanstack/react-query';
import { useTicks } from '../hooks/useTicks.js';
import { api } from '../lib/api.js';
import { formatINR, formatPct } from '../lib/money.js';

const INDEX_SYMBOLS = ['NIFTY50', 'SENSEX', 'BANKNIFTY'];
const INDEX_LABELS = {
  NIFTY50: 'NIFTY 50',
  SENSEX: 'SENSEX',
  BANKNIFTY: 'BANK NIFTY',
};

export default function IndexStrip() {
  const { getTick } = useTicks();

  const { data } = useQuery({
    queryKey: ['instruments'],
    queryFn: api.instruments,
    staleTime: Infinity,
  });

  const indices = (data?.instruments ?? []).filter((i) => !i.tradable);

  if (indices.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-2 bg-[#0d1117] border-b border-gray-800">
      {indices.map((inst) => {
        const tick = getTick(inst.symbol);
        const changePaise = tick
          ? tick.pricePaise - (tick.prevClosePaise ?? tick.pricePaise)
          : 0;
        const changePct = tick?.prevClosePaise
          ? (changePaise / tick.prevClosePaise) * 100
          : 0;
        const up = changePaise >= 0;

        return (
          <div
            key={inst.symbol}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900/40"
          >
            <div>
              <div className="text-xs text-gray-500 font-medium">
                {INDEX_LABELS[inst.symbol] ?? inst.name}
              </div>
              <div className="font-mono font-semibold text-sm text-white mt-0.5">
                {tick?.pricePaise ? formatINR(tick.pricePaise) : '—'}
              </div>
            </div>
            {tick && (
              <div className={`ml-auto text-right text-xs ${up ? 'pnl-pos' : 'pnl-neg'}`}>
                <div>{up ? '▲' : '▼'} {formatPct(Math.abs(changePct))}</div>
                <div className="text-gray-500 font-mono">
                  {up ? '+' : ''}{formatINR(changePaise)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
