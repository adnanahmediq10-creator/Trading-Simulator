/**
 * WatchList — live price feed for all instruments.
 * Props: { onSelectSymbol, selectedSymbol }
 */
import { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTicks } from '../hooks/useTicks.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/money.js';

export default function WatchList({ onSelectSymbol, selectedSymbol }) {
  const { getTick } = useTicks();
  const { data } = useQuery({
    queryKey: ['instruments'],
    queryFn: api.instruments,
    staleTime: Infinity,
  });

  const instruments = data?.instruments ?? [];
  const tradable = instruments.filter((i) => i.tradable);
  const indices = instruments.filter((i) => !i.tradable);

  return (
    <div className="flex flex-col h-full">
      {/* Index strip */}
      {indices.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {indices.map((inst) => {
            const tick = getTick(inst.symbol);
            return <IndexTile key={inst.symbol} inst={inst} tick={tick} />;
          })}
        </div>
      )}

      {/* Tradable stocks */}
      <div className="flex-1 overflow-y-auto">
        <div className="text-xs text-gray-500 px-2 mb-1 uppercase tracking-wider">NSE Equities</div>
        <div className="space-y-0.5">
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
    </div>
  );
}

function IndexTile({ inst, tick }) {
  const pricePaise = tick?.pricePaise;
  const changePaise = tick ? tick.pricePaise - (tick.prevClosePaise ?? tick.pricePaise) : 0;
  const pct = tick?.prevClosePaise ? ((changePaise / tick.prevClosePaise) * 100).toFixed(2) : null;
  const up = changePaise >= 0;

  return (
    <div className="card p-2.5 space-y-0.5">
      <div className="text-xs text-gray-500 truncate">{inst.name}</div>
      <div className="font-mono font-semibold text-sm text-white">
        {pricePaise ? formatINR(pricePaise) : '—'}
      </div>
      {pct != null && (
        <div className={`text-xs ${up ? 'pnl-pos' : 'pnl-neg'}`}>
          {up ? '+' : ''}{pct}%
        </div>
      )}
    </div>
  );
}

function StockRow({ inst, tick, selected, onClick }) {
  const prevRef = useRef(null);
  const [flash, setFlash] = useState('');

  // Flash on price change
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
  const pct = tick?.prevClosePaise ? ((changePaise / tick.prevClosePaise) * 100) : 0;
  const up = changePaise >= 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
        selected ? 'bg-sky-900/40 border border-sky-800/60' : 'hover:bg-gray-800/60'
      } ${flash}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{inst.symbol}</div>
        <div className="text-xs text-gray-500 truncate">{inst.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono text-sm font-medium ${tick?.pricePaise ? 'text-white' : 'text-gray-600'}`}>
          {tick?.pricePaise ? formatINR(tick.pricePaise) : '—'}
        </div>
        {tick && (
          <div className={`text-xs ${up ? 'pnl-pos' : 'pnl-neg'}`}>
            {up ? '+' : ''}{pct.toFixed(2)}%
          </div>
        )}
      </div>
    </button>
  );
}
