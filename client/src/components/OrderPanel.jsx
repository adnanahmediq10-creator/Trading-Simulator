/**
 * OrderPanel — place MARKET or LIMIT orders.
 * Props: { symbol, pricePaise, onSuccess }
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v4 as uuid } from 'uuid';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { formatINR, formatINRCompact, rupeesToPaise, isValidTick } from '../lib/money.js';
import { useToast } from './Toasts.jsx';

export default function OrderPanel({ symbol, pricePaise, onSuccess }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [side, setSide] = useState('BUY');
  const [type, setType] = useState('MARKET');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [error, setError] = useState('');

  const buyingPower = user ? user.cashPaise - (user.reservedCashPaise ?? 0) : 0;

  const mutation = useMutation({
    mutationFn: ({ body, key }) => api.placeOrder(body, key),
    onSuccess: (data) => {
      const o = data.order;
      toast(`${o.side} ${o.qty} ${o.symbol} — ${o.status}`, 'success');
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
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">{symbol}</h3>
        <span className="font-mono font-medium text-lg text-white">{formatINR(pricePaise)}</span>
      </div>

      {/* BUY / SELL toggle */}
      <div className="grid grid-cols-2 rounded-lg overflow-hidden border border-gray-700">
        <button
          id="order-buy-btn"
          onClick={() => setSide('BUY')}
          className={`py-2 text-sm font-semibold transition-colors ${side === 'BUY' ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          BUY
        </button>
        <button
          id="order-sell-btn"
          onClick={() => setSide('SELL')}
          className={`py-2 text-sm font-semibold transition-colors ${side === 'SELL' ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          SELL
        </button>
      </div>

      {/* Order type */}
      <div className="flex gap-2">
        {['MARKET', 'LIMIT'].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
              type === t ? 'border-sky-500 text-sky-400 bg-sky-900/30' : 'border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Quantity */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Quantity (shares)</label>
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

        {/* Limit price (only for LIMIT) */}
        {type === 'LIMIT' && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Limit Price (₹)</label>
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
          </div>
        )}

        {/* Order summary */}
        <div className="bg-gray-900 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex justify-between text-gray-400">
            <span>Price</span>
            <span className="font-mono">{type === 'LIMIT' ? (limitPaiseParsed ? formatINR(limitPaiseParsed) : '—') : formatINR(pricePaise)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Est. Total</span>
            <span className="font-mono font-medium text-white">{type === 'LIMIT' ? limitTotal : totalCost}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Buying Power</span>
            <span className={`font-mono ${buyingPower < (pricePaise * (qtyNum || 0)) ? 'text-red-400' : 'text-gray-300'}`}>
              {formatINRCompact(buyingPower)}
            </span>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          id="order-submit-btn"
          type="submit"
          disabled={mutation.isPending || !qty}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
            side === 'BUY'
              ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-red-600 hover:bg-red-500 disabled:bg-red-900 text-white shadow-lg shadow-red-600/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {mutation.isPending
            ? 'Placing…'
            : `${side} ${qty || '—'} ${symbol} ${type === 'MARKET' ? 'at Market' : 'Limit'}`}
        </button>
      </form>
    </div>
  );
}
