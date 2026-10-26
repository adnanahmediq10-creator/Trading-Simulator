/**
 * OrderPanel — place MARKET or LIMIT orders.
 *   MARKET  → executes immediately at current best price
 *   LIMIT   → queued; auto-executes when market price touches your target price
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
  { value: 'LIMIT',  label: 'Limit',  sublabel: 'Auto at price' },
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSide, prefillQty]);

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
        ? `Limit ${o.side} ${o.qty} ${o.symbol} queued at ${formatINR(o.limitPricePaise)} — will auto-fill when price hits`
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
      setError(err.message ?? 'Order failed');
      toast(err.message ?? 'Order failed', 'error');
    },
  });

  const qtyNum = parseInt(qty, 10);
  const limitPaiseParsed = type === 'LIMIT' ? rupeesToPaise(limitPrice) : pricePaise;
  const totalCost = pricePaise && qtyNum > 0 ? formatINRCompact(pricePaise * qtyNum) : '—';
  const limitTotal = limitPaiseParsed && qtyNum > 0 ? formatINRCompact(limitPaiseParsed * qtyNum) : '—';
  const notEnoughFunds = side === 'BUY' && qtyNum > 0 && pricePaise && buyingPower < pricePaise * qtyNum;

  function validate() {
    if (!qtyNum || qtyNum < 1 || qtyNum > 10000) return 'Quantity must be 1–10,000';
    if (type === 'LIMIT') {
      if (!limitPaiseParsed) return 'Enter a valid limit price';
      if (!isValidTick(limitPaiseParsed)) return 'Price must be a multiple of ₹0.05';
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
    return <div className="card p-4 text-center text-gray-500 text-sm">Waiting for price…</div>;
  }

  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white text-base">{symbol}</h3>
        <span className="font-mono font-semibold text-lg text-white">{formatINR(pricePaise)}</span>
      </div>

      {/* BUY / SELL toggle */}
      <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-gray-700/60">
        <button
          id="order-buy-btn"
          onClick={() => setSide('BUY')}
          className={`py-2.5 text-sm font-bold transition-all ${
            side === 'BUY'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700/60'
          }`}
        >
          BUY
        </button>
        <button
          id="order-sell-btn"
          onClick={() => setSide('SELL')}
          className={`py-2.5 text-sm font-bold transition-all ${
            side === 'SELL'
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
              : 'bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700/60'
          }`}
        >
          SELL
        </button>
      </div>

      {/* Order type selector */}
      <div className="grid grid-cols-2 gap-2">
        {ORDER_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`py-2 px-3 rounded-xl border text-left transition-all ${
              type === t.value
                ? 'border-sky-500 bg-sky-900/30 text-sky-300'
                : 'border-gray-700/60 text-gray-500 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            <div className="text-xs font-semibold">{t.label}</div>
            <div className="text-[10px] opacity-70 mt-0.5">{t.sublabel}</div>
          </button>
        ))}
      </div>

      {/* Limit info banner */}
      {type === 'LIMIT' && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2 text-[11px] text-amber-300/80 leading-relaxed">
          ⚡ Order queues on the book. Auto-executes the moment market price touches your limit — no action needed.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Quantity */}
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block font-medium">Quantity (shares)</label>
          <input
            id="order-qty"
            type="number"
            min="1"
            max="10000"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="input"
            placeholder="e.g. 10"
            required
          />
        </div>

        {/* Limit price */}
        {type === 'LIMIT' && (
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block font-medium">
              Target Price (₹)
              <span className="ml-2 text-gray-600 font-normal">— auto-fills when hit</span>
            </label>
            <input
              id="order-limit-price"
              type="number"
              min="0.05"
              step="0.05"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="input"
              placeholder="e.g. 1480.00"
              required
            />
            {/* Quick price buttons */}
            {pricePaise && (
              <div className="flex gap-1 mt-1.5">
                {[-2, -1, 0, +1, +2].map((offset) => {
                  const adjPaise = pricePaise + offset * 100;
                  const label = offset === 0 ? 'LTP' : `${offset > 0 ? '+' : ''}${offset}`;
                  return (
                    <button
                      key={offset}
                      type="button"
                      onClick={() => setLimitPrice((adjPaise / 100).toFixed(2))}
                      className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                        limitPrice === (adjPaise / 100).toFixed(2)
                          ? 'border-sky-500 bg-sky-900/30 text-sky-300'
                          : 'border-gray-700/40 text-gray-600 hover:text-gray-300 hover:border-gray-600'
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

        {/* Order summary */}
        <div className="bg-gray-900/60 rounded-xl p-3 text-xs space-y-1.5 border border-gray-800/60">
          <div className="flex justify-between text-gray-500">
            <span>Price</span>
            <span className="font-mono text-gray-300">
              {type === 'LIMIT'
                ? (limitPaiseParsed ? formatINR(limitPaiseParsed) : '—')
                : formatINR(pricePaise)}
            </span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Est. Total</span>
            <span className="font-mono font-semibold text-white">
              {type === 'LIMIT' ? limitTotal : totalCost}
            </span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Buying Power</span>
            <span className={`font-mono ${notEnoughFunds ? 'text-red-400' : 'text-gray-300'}`}>
              {formatINRCompact(buyingPower)}
            </span>
          </div>
        </div>

        {notEnoughFunds && side === 'BUY' && (
          <p className="text-amber-400 text-xs">⚠ Insufficient buying power for this order</p>
        )}
        {error && <p className="text-red-400 text-xs">⚠ {error}</p>}

        <button
          id="order-submit-btn"
          type="submit"
          disabled={mutation.isPending || !qty}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
            side === 'BUY'
              ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/40 text-white shadow-lg shadow-emerald-600/10'
              : 'bg-red-600 hover:bg-red-500 disabled:bg-red-900/40 text-white shadow-lg shadow-red-600/10'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {mutation.isPending
            ? 'Placing…'
            : type === 'LIMIT'
              ? `${side} ${qty || '—'} × ${symbol} @ ₹${limitPrice || '?'}`
              : `${side} ${qty || '—'} × ${symbol} at Market`}
        </button>
      </form>
    </div>
  );
}
