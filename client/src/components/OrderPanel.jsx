/**
 * OrderPanel — place MARKET or LIMIT orders in light theme.
 *   MARKET  → executes immediately at current best price
 *   LIMIT   → queued; triggers when price crosses the target after placement
 *
 * Props: { symbol, pricePaise, onSuccess, prefillSide, prefillQty, onPrefillConsumed }
 */
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v4 as uuid } from 'uuid';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { formatINR, formatINRCompact, rupeesToPaise, isValidTick } from '../lib/money.js';
import { useToast } from './Toasts.jsx';

const ORDER_TYPES = [
  { value: 'MARKET', label: 'Market', sublabel: 'Instant fill' },
  { value: 'LIMIT',  label: 'Limit',  sublabel: 'Target crossing' },
];

export default function OrderPanel({ symbol, pricePaise, onSuccess, prefillSide, prefillQty, onPrefillConsumed }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [side, setSide] = useState('BUY');
  const [type, setType] = useState('MARKET');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [error, setError] = useState('');

  // Consume prefill (e.g., from Sell shortcut in PositionsTable)
  useEffect(() => {
    if (prefillSide) {
      setSide(prefillSide);
      if (prefillQty) setQty(prefillQty);
      setType('MARKET');
      onPrefillConsumed?.();
    }
  }, [prefillSide, prefillQty]); // eslint-disable-line react-hooks/exhaustive-deps

  // When switching TO limit mode, pre-populate with current price so user only tweaks
  useEffect(() => {
    if (type === 'LIMIT' && pricePaise && !limitPrice) {
      setLimitPrice((pricePaise / 100).toFixed(2));
    }
  }, [type, pricePaise]); // eslint-disable-line react-hooks/exhaustive-deps

  const buyingPower = user ? user.cashPaise - (user.reservedCashPaise ?? 0) : 0;

  const mutation = useMutation({
    mutationFn: ({ body, key }) => api.placeOrder(body, key),
    onSuccess: (data) => {
      const o = data.order;
      const msg = o.type === 'LIMIT'
        ? `Limit ${o.side} ${o.qty} ${o.symbol} queued at ${formatINR(o.limitPricePaise)} — waiting for target cross`
        : `${o.side} ${o.qty} ${o.symbol} — ${o.status}`;
      toast(msg, 'success');
      setQty('');
      setLimitPrice('');
      setError('');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message ?? 'Order placement failed');
      toast(err.message ?? 'Order placement failed', 'error');
    },
  });

  const qtyNum = parseInt(qty, 10);
  const limitPaiseParsed = type === 'LIMIT' ? rupeesToPaise(limitPrice) : pricePaise;
  const totalCost = pricePaise && qtyNum > 0 ? formatINRCompact(pricePaise * qtyNum) : '—';
  const limitTotal = limitPaiseParsed && qtyNum > 0 ? formatINRCompact(limitPaiseParsed * qtyNum) : '—';
  const notEnoughFunds = side === 'BUY' && qtyNum > 0 && pricePaise && buyingPower < pricePaise * qtyNum;

  function validate() {
    if (!qtyNum || qtyNum < 1 || qtyNum > 10000) return 'Quantity must be between 1 and 10,000 shares';
    if (type === 'LIMIT') {
      if (!limitPaiseParsed) return 'Please enter a valid limit price';
      if (!isValidTick(limitPaiseParsed)) return 'Price must align with NSE ₹0.05 tick size';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');

    const body = {
      symbol,
      side,
      type,
      qty: qtyNum,
      ...(type === 'LIMIT' ? { limitPricePaise: limitPaiseParsed } : {}),
    };

    await mutation.mutateAsync({ body, key: uuid() });
  }

  if (!pricePaise) {
    return (
      <div className="card p-6 text-center text-slate-400 text-xs font-mono animate-pulse bg-white">
        Connecting to feed…
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-4 shadow-xs select-none bg-white border border-slate-200">
      {/* Header with Symbol & Live Market Quote */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Order Ticket
          </span>
          <h3 className="font-bold text-slate-900 text-base tracking-tight leading-none mt-0.5">
            {symbol}
          </h3>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-mono block">LTP</span>
          <span className="font-mono font-bold text-base text-slate-900 tabular-nums leading-none">
            {formatINR(pricePaise)}
          </span>
        </div>
      </div>

      {/* Segmented BUY / SELL Switch */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1">
        <button
          id="order-buy-btn"
          type="button"
          onClick={() => setSide('BUY')}
          className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            side === 'BUY'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 border border-emerald-600'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>BUY</span>
        </button>
        <button
          id="order-sell-btn"
          type="button"
          onClick={() => setSide('SELL')}
          className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            side === 'SELL'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25 border border-rose-600'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>SELL</span>
        </button>
      </div>

      {/* Order Type Selector */}
      <div className="grid grid-cols-2 gap-2">
        {ORDER_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`py-2 px-3 rounded-xl border text-left transition-all ${
              type === t.value
                ? 'border-sky-500 bg-sky-50 text-sky-800 shadow-2xs font-bold'
                : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            <div className="text-xs font-bold leading-tight">{t.label}</div>
            <div className="text-[10px] opacity-75 leading-tight mt-0.5 font-medium">{t.sublabel}</div>
          </button>
        ))}
      </div>

      {/* Limit Notice Banner */}
      {type === 'LIMIT' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
          <span className="text-amber-600 text-xs font-bold">⚡</span>
          <span>
            Limit orders queue in the book until the market price crosses your target.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Quantity Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-slate-700 font-semibold" htmlFor="order-qty">
              Quantity (Shares)
            </label>
            <span className="text-[10px] text-slate-400 font-mono">1 – 10,000</span>
          </div>
          <input
            id="order-qty"
            type="number"
            min="1"
            max="10000"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="input font-mono tabular-nums text-sm font-semibold"
            placeholder="e.g. 10"
            required
          />
        </div>

        {/* Limit Price Field */}
        {type === 'LIMIT' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-700 font-semibold" htmlFor="order-limit-price">
                Target Price (₹)
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Tick: ₹0.05</span>
            </div>
            <input
              id="order-limit-price"
              type="number"
              min="0.05"
              step="0.05"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="input font-mono tabular-nums text-sm font-semibold"
              placeholder="e.g. 1480.00"
              required
            />
            {/* Quick Offset Buttons */}
            {pricePaise && (
              <div className="flex gap-1 mt-1.5">
                {[-2, -1, 0, +1, +2].map((offset) => {
                  const adjPaise = pricePaise + offset * 100;
                  const label = offset === 0 ? 'LTP' : `${offset > 0 ? '+' : ''}${offset}`;
                  const isCurrent = limitPrice === (adjPaise / 100).toFixed(2);
                  return (
                    <button
                      key={offset}
                      type="button"
                      onClick={() => setLimitPrice((adjPaise / 100).toFixed(2))}
                      className={`flex-1 text-[10px] font-mono py-1 rounded-md border transition-all ${
                        isCurrent
                          ? 'border-sky-500 bg-sky-50 text-sky-700 font-bold'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Order Cost Breakdown Box */}
        <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-2 border border-slate-200">
          <div className="flex justify-between text-slate-500 font-medium">
            <span>Price</span>
            <span className="font-mono text-slate-800 tabular-nums font-semibold">
              {type === 'LIMIT'
                ? (limitPaiseParsed ? formatINR(limitPaiseParsed) : '—')
                : formatINR(pricePaise)}
            </span>
          </div>
          <div className="flex justify-between text-slate-500 font-medium">
            <span>Estimated Total</span>
            <span className="font-mono font-bold text-slate-900 tabular-nums">
              {type === 'LIMIT' ? limitTotal : totalCost}
            </span>
          </div>
          <div className="flex justify-between text-slate-500 pt-1.5 border-t border-slate-200 font-medium">
            <span>Available Buying Power</span>
            <span
              className={`font-mono font-bold tabular-nums ${
                notEnoughFunds ? 'text-rose-600' : 'text-slate-800'
              }`}
            >
              {formatINRCompact(buyingPower)}
            </span>
          </div>
        </div>

        {/* Validation and Balance Alerts */}
        {notEnoughFunds && side === 'BUY' && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-1.5 font-medium">
            <span>⚠️</span>
            <span>Insufficient buying power for this order</span>
          </div>
        )}
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-1.5 font-medium">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Dynamic Action Submit Button */}
        <button
          id="order-submit-btn"
          type="submit"
          disabled={mutation.isPending || !qty}
          className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
            side === 'BUY'
              ? 'btn-buy w-full shadow-md shadow-emerald-600/20'
              : 'btn-sell w-full shadow-md shadow-rose-600/20'
          }`}
        >
          {mutation.isPending
            ? 'Transmitting Order…'
            : type === 'LIMIT'
              ? `${side} ${qty || '—'} × ${symbol} @ ₹${limitPrice || '?'}`
              : `${side} ${qty || '—'} × ${symbol} at Market`}
        </button>
      </form>
    </div>
  );
}
