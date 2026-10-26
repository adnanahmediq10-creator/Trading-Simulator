/**
 * Unit tests for server-side money helpers (engine/money.js).
 */
import { describe, it, expect } from 'vitest';
import {
  assertPaise,
  safePaise,
  toPaise,
  paiseToRupees,
  mulPaise,
  weightedAvg,
  realizedPnl,
  isValidPrice,
  TICK_SIZE_PAISE,
} from '../../src/engine/money.js';

describe('assertPaise', () => {
  it('passes for valid safe integers', () => {
    expect(() => assertPaise(100)).not.toThrow();
    expect(() => assertPaise(0)).not.toThrow();
    expect(() => assertPaise(-100)).not.toThrow(); // negative allowed by default
    expect(() => assertPaise(99_999_999)).not.toThrow();
  });

  it('throws for floats', () => {
    expect(() => assertPaise(100.5)).toThrow(TypeError);
  });

  it('throws for negative when minZero=true', () => {
    expect(() => assertPaise(-1, 'price', true)).toThrow(TypeError);
  });

  it('allows negative by default (for P&L)', () => {
    expect(() => assertPaise(-5000)).not.toThrow();
  });
});

describe('safePaise', () => {
  it('rounds a float to nearest integer', () => {
    expect(safePaise(100.7)).toBe(101);
    expect(safePaise(100.4)).toBe(100);
  });

  it('returns integer as-is', () => {
    expect(safePaise(500)).toBe(500);
    expect(safePaise(0)).toBe(0);
  });
});

describe('toPaise', () => {
  it('converts rupees to paise correctly', () => {
    expect(toPaise(1)).toBe(100);
    expect(toPaise(2800)).toBe(280000);
    expect(toPaise(0)).toBe(0);
  });

  it('rounds fractional rupees', () => {
    expect(toPaise(10.5)).toBe(1050);  // 1050.0 exact
    expect(toPaise(10.55)).toBe(1055); // 1055.0 exact
    expect(toPaise(10.001)).toBe(1000); // 1000.1 → 1000
  });
});

describe('paiseToRupees', () => {
  it('converts paise to rupees', () => {
    expect(paiseToRupees(100)).toBe(1);
    expect(paiseToRupees(25050)).toBe(250.5);
    expect(paiseToRupees(0)).toBe(0);
  });
});

describe('mulPaise', () => {
  it('multiplies correctly', () => {
    expect(mulPaise(28000, 10)).toBe(280000);
    expect(mulPaise(100, 0)).toBe(0);
  });

  it('throws on integer overflow', () => {
    expect(() => mulPaise(Number.MAX_SAFE_INTEGER, 2)).toThrow(/overflow/);
  });
});

describe('weightedAvg', () => {
  it('returns new price when existing qty is 0', () => {
    expect(weightedAvg(0, 0, 10, 1000)).toBe(1000);
  });

  it('computes correct weighted average', () => {
    // 10 shares @ 100 + 5 shares @ 200 → 15 shares @ ~133
    const avg = weightedAvg(10, 100, 5, 200);
    expect(avg).toBe(Math.round(2000 / 15));
  });

  it('handles large paise values (RELIANCE ₹2800)', () => {
    const avg = weightedAvg(5, 280000, 5, 290000);
    expect(avg).toBe(285000);
  });

  it('returns old avg when addQty is 0', () => {
    expect(weightedAvg(10, 5000, 0, 6000)).toBe(5000);
  });
});

describe('realizedPnl', () => {
  it('calculates profit: sell > avgCost', () => {
    // sellPrice=150, avgCost=100, qty=10 → P&L = 500
    expect(realizedPnl(150, 100, 10)).toBe(500);
  });

  it('calculates loss: sell < avgCost', () => {
    expect(realizedPnl(150, 200, 10)).toBe(-500);
  });

  it('returns 0 on break-even', () => {
    expect(realizedPnl(100, 100, 10)).toBe(0);
  });
});

describe('isValidPrice', () => {
  it('accepts positive multiples of 5 paise', () => {
    expect(isValidPrice(5)).toBe(true);
    expect(isValidPrice(100)).toBe(true);
    expect(isValidPrice(280005)).toBe(true);
  });

  it('rejects non-multiples', () => {
    expect(isValidPrice(3)).toBe(false);
    expect(isValidPrice(101)).toBe(false);
  });

  it('rejects zero and negative', () => {
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(-5)).toBe(false);
  });

  it('rejects floats', () => {
    expect(isValidPrice(5.5)).toBe(false);
  });
});

describe('TICK_SIZE_PAISE', () => {
  it('is 5 paise (NSE minimum tick)', () => {
    expect(TICK_SIZE_PAISE).toBe(5);
  });
});
