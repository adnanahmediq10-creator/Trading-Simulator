/**
 * WatchList — live price feed for tradable NSE equities in light theme.
 * Indices are shown in the IndexStrip above, not here.
 * Props: { onSelectSymbol, selectedSymbol }
 */
import { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTicks } from '../hooks/useTicks.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/money.js';

export default function WatchList({ onSelectSymbol, selectedSymbol }) {
  const { getTick } = useTicks();
  const { data, isLoading } = useQuery({
    queryKey: ['instruments'],
    queryFn: api.instruments,
    staleTime: Infinity,
  });

  const instruments = data?.instruments ?? [];
  const tradable = instruments.filter((i) => i.tradable);

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="h-11 rounded-lg bg-slate-100 animate-pulse border border-slate-200" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden select-none bg-white">
      {/* Section Header */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            Market Watch
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 border border-slate-300">
          {tradable.length}
        </span>
      </div>

      {/* Stock Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 py-0.5">
        {tradable.map((inst) => {
          const tick = getTick(inst.symbol);
          return (
            <StockRow
              key={inst.symbol}
              inst={inst}
              tick={tick}
              selected={inst.symbol === selectedSymbol}
              onClick={() => onSelectSymbol?.(inst.symbol)}
            />
          );
        })}
      </div>
    </div>
  );
}

function StockRow({ inst, tick, selected, onClick }) {
  const prevRef = useRef(null);
  const [flash, setFlash] = useState('');

  // Flash cell background on price change
  useEffect(() => {
    const price = tick?.pricePaise;
    if (!price) return;
    if (prevRef.current !== null && prevRef.current !== price) {
      const up = price > prevRef.current;
      setFlash(up ? 'flash-up' : 'flash-down');
      const t = setTimeout(() => setFlash(''), 500);
      prevRef.current = price;
      return () => clearTimeout(t);
    }
    prevRef.current = price;
  }, [tick?.pricePaise]);

  const changePaise = tick ? tick.pricePaise - (tick.prevClosePaise ?? tick.pricePaise) : 0;
  const pct = tick?.prevClosePaise ? (changePaise / tick.prevClosePaise) * 100 : 0;
  const up = changePaise >= 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all relative ${
        selected
          ? 'bg-sky-50/80 border-l-[3px] border-sky-500 shadow-2xs'
          : 'border-l-[3px] border-transparent hover:bg-slate-50'
      } ${flash}`}
    >
      {/* Symbol & Company Name */}
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-900 tracking-tight truncate">
            {inst.symbol}
          </span>
          <span className="text-[9px] font-mono text-slate-400 font-semibold">EQ</span>
        </div>
        <div className="text-[10px] text-slate-500 truncate leading-tight mt-0.5 font-medium">
          {inst.name}
        </div>
      </div>

      {/* LTP & % Change */}
      <div className="text-right shrink-0 flex flex-col items-end">
        <div
          className={`font-mono text-xs font-bold tracking-tight tabular-nums ${
            tick?.pricePaise ? 'text-slate-900' : 'text-slate-400'
          }`}
        >
          {tick?.pricePaise ? formatINR(tick.pricePaise) : '—'}
        </div>
        {tick ? (
          <div
            className={`text-[10px] font-mono font-bold leading-tight mt-0.5 px-1.5 py-0.5 rounded tabular-nums flex items-center gap-0.5 ${
              up
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            <span>{up ? '+' : ''}{pct.toFixed(2)}%</span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400">—</span>
        )}
      </div>
    </button>
  );
}
