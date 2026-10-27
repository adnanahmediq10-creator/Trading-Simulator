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

  const indices = (data?.instruments ?? []).filter((i) => INDEX_SYMBOLS.includes(i.symbol));

  if (indices.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-4 py-2 bg-slate-100/70 border-b border-slate-200">
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
            className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors"
          >
            <div>
              <div className="text-[11px] text-slate-500 font-bold tracking-wider uppercase">
                {INDEX_LABELS[inst.symbol] ?? inst.name}
              </div>
              <div className="font-mono font-bold text-sm text-slate-900 mt-0.5 tabular-nums">
                {tick?.pricePaise ? formatINR(tick.pricePaise) : '—'}
              </div>
            </div>

            {tick && (
              <div
                className={`flex flex-col items-end text-xs font-mono font-semibold px-2 py-1 rounded-md ${
                  up
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                <div className="flex items-center gap-1 leading-tight tabular-nums font-bold">
                  <span>{up ? '▲' : '▼'}</span>
                  <span>{formatPct(Math.abs(changePct))}</span>
                </div>
                <div className="text-[10px] opacity-80 leading-tight mt-0.5 tabular-nums font-medium">
                  {up ? '+' : ''}
                  {formatINR(changePaise)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
