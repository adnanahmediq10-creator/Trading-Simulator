/**
 * WatchList — live price feed for tradable NSE equities.
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
  // Only show tradable equities — indices are in IndexStrip above
  const tradable = instruments.filter((i) => i.tradable);

  if (isLoading) {
    return (
      <div className="p-3 space-y-1.5">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-gray-800/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Section header */}
      <div className="px-3 py-1.5 border-b border-gray-800/60">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            NSE Equities
          </span>
          <span className="text-[10px] text-gray-600">{tradable.length} stocks</span>
        </div>
      </div>

      {/* Stock rows */}
      <div className="flex-1 overflow-y-auto py-1">
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
      const t = setTimeout(() => setFlash(''), 600);
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
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all ${
        selected
          ? 'bg-sky-900/30 border-l-2 border-sky-500'
          : 'border-l-2 border-transparent hover:bg-gray-800/40'
      } ${flash}`}
    >
      {/* Symbol + name */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate leading-tight">
          {inst.symbol}
        </div>
        <div className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
          {inst.name}
        </div>
      </div>

      {/* Price + change */}
      <div className="text-right shrink-0">
        <div className={`font-mono text-sm font-semibold leading-tight ${
          tick?.pricePaise ? 'text-white' : 'text-gray-600'
        }`}>
          {tick?.pricePaise ? formatINR(tick.pricePaise) : '—'}
        </div>
        {tick && (
          <div className={`text-[11px] font-medium leading-tight mt-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? '+' : ''}{pct.toFixed(2)}%
          </div>
        )}
      </div>
    </button>
  );
}
