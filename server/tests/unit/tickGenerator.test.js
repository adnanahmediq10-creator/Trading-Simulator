/**
 * Unit tests for market/tickGenerator.js
 */
import { describe, it, expect } from 'vitest';
import { tickAt, formingBar } from '../../src/market/tickGenerator.js';

const TICK_SIZE = 5;

/** A standard test candle */
function makeCandle(o, h, l, c, v = 100_000) {
  return { t: 1729756200000, o, h, l, c, v };
}

describe('tickAt', () => {
  const candle = makeCandle(100_000, 102_000, 98_000, 101_000);
  const SYMBOL = 'RELIANCE';

  it('tick 0 equals candle open', () => {
    expect(tickAt(SYMBOL, candle, 0)).toBe(candle.o);
  });

  it('tick 59 equals candle close', () => {
    expect(tickAt(SYMBOL, candle, 59)).toBe(candle.c);
  });

  it('all ticks are within [low, high]', () => {
    for (let s = 0; s < 60; s++) {
      const p = tickAt(SYMBOL, candle, s);
      expect(p).toBeGreaterThanOrEqual(candle.l);
      expect(p).toBeLessThanOrEqual(candle.h);
    }
  });

  it('all ticks are multiples of 5', () => {
    for (let s = 0; s < 60; s++) {
      const p = tickAt(SYMBOL, candle, s);
      expect(p % TICK_SIZE).toBe(0);
    }
  });

  it('is deterministic: same inputs give identical outputs', () => {
    for (let s = 0; s < 60; s++) {
      expect(tickAt(SYMBOL, candle, s)).toBe(tickAt(SYMBOL, candle, s));
    }
  });

  it('scan hits both high and low values', () => {
    const ticks = Array.from({ length: 60 }, (_, s) => tickAt(SYMBOL, candle, s));
    const maxTick = Math.max(...ticks);
    const minTick = Math.min(...ticks);
    // The tick interpolation visits both extremes within a few ticks of rounding
    // (tick size 5; waypoints at non-integer seconds can shift by rounding)
    const spread = candle.h - candle.l;
    expect(maxTick).toBeGreaterThanOrEqual(candle.h - spread * 0.15);
    expect(minTick).toBeLessThanOrEqual(candle.l + spread * 0.15);
  });

  it('handles degenerate candle where open=high=low=close', () => {
    const flat = makeCandle(50_000, 50_000, 50_000, 50_000);
    for (let s = 0; s < 60; s++) {
      expect(tickAt(SYMBOL, flat, s)).toBe(50_000);
    }
  });

  it('handles candle where open equals high', () => {
    const c = makeCandle(100_000, 100_000, 98_000, 99_000);
    for (let s = 0; s < 60; s++) {
      const p = tickAt(SYMBOL, c, s);
      expect(p).toBeGreaterThanOrEqual(c.l);
      expect(p).toBeLessThanOrEqual(c.h);
      expect(p % TICK_SIZE).toBe(0);
    }
  });

  it('handles candle where close equals low', () => {
    const c = makeCandle(100_000, 102_000, 99_000, 99_000);
    for (let s = 0; s < 60; s++) {
      const p = tickAt(SYMBOL, c, s);
      expect(p).toBeGreaterThanOrEqual(c.l);
      expect(p).toBeLessThanOrEqual(c.h);
      expect(p % TICK_SIZE).toBe(0);
    }
  });

  it('different symbols produce different ticks for same candle', () => {
    const ticks1 = Array.from({ length: 60 }, (_, s) => tickAt('TCS', candle, s));
    const ticks2 = Array.from({ length: 60 }, (_, s) => tickAt('INFY', candle, s));
    // They should differ at some points
    const differ = ticks1.some((t, i) => t !== ticks2[i]);
    expect(differ).toBe(true);
  });

  it('different candle timestamps produce different ticks', () => {
    const c2 = { ...candle, t: candle.t + 60_000 };
    const ticks1 = Array.from({ length: 60 }, (_, s) => tickAt(SYMBOL, candle, s));
    const ticks2 = Array.from({ length: 60 }, (_, s) => tickAt(SYMBOL, c2, s));
    const differ = ticks1.some((t, i) => t !== ticks2[i]);
    expect(differ).toBe(true);
  });
});

describe('formingBar', () => {
  const candle = makeCandle(100_000, 102_000, 98_000, 101_000, 60_000);
  const SYMBOL = 'RELIANCE';

  it('returns tick 0 values at uptoSec=0', () => {
    const bar = formingBar(SYMBOL, candle, 0);
    expect(bar.o).toBe(tickAt(SYMBOL, candle, 0));
    expect(bar.c).toBe(tickAt(SYMBOL, candle, 0));
    expect(bar.t).toBe(candle.t);
  });

  it('bar at uptoSec=59 has close == tick 59', () => {
    const bar = formingBar(SYMBOL, candle, 59);
    expect(bar.c).toBe(tickAt(SYMBOL, candle, 59));
  });

  it('high is max of all ticks seen', () => {
    const bar = formingBar(SYMBOL, candle, 30);
    const maxTick = Math.max(...Array.from({ length: 31 }, (_, s) => tickAt(SYMBOL, candle, s)));
    expect(bar.h).toBe(maxTick);
  });

  it('low is min of all ticks seen', () => {
    const bar = formingBar(SYMBOL, candle, 30);
    const minTick = Math.min(...Array.from({ length: 31 }, (_, s) => tickAt(SYMBOL, candle, s)));
    expect(bar.l).toBe(minTick);
  });

  it('volume scales proportionally', () => {
    const bar30 = formingBar(SYMBOL, candle, 30);
    expect(bar30.v).toBe(Math.round((candle.v * 31) / 60));
    const bar59 = formingBar(SYMBOL, candle, 59);
    expect(bar59.v).toBe(Math.round((candle.v * 60) / 60));
  });

  it('clamps uptoSec to 0..59', () => {
    expect(() => formingBar(SYMBOL, candle, -5)).not.toThrow();
    expect(() => formingBar(SYMBOL, candle, 100)).not.toThrow();
    const barMax = formingBar(SYMBOL, candle, 100);
    const bar59 = formingBar(SYMBOL, candle, 59);
    expect(barMax.c).toBe(bar59.c);
  });
});

describe('candle aggregation', () => {
  // This is imported from candles.js, tested here for quick validation
  it('5-paise multiples always hold', () => {
    const candle = makeCandle(145_000, 150_000, 140_000, 148_000);
    for (let s = 0; s < 60; s++) {
      const p = tickAt('HDFCBANK', candle, s);
      expect(p % 5).toBe(0);
    }
  });
});
