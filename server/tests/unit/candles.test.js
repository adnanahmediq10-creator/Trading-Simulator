/**
 * Unit tests for money helpers and candle aggregation
 */
import { describe, it, expect } from 'vitest';
import { aggregate, fillGaps, bucketStart, sessionOpenMs } from '../../src/market/candles.js';

const SESSION_DATE = '2026-10-23';
const OPEN_MS = sessionOpenMs(SESSION_DATE);
const MIN_MS = 60_000;

function makeCandles(count, startOffset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    t: OPEN_MS + (startOffset + i) * MIN_MS,
    o: 100_000 + i * 10,
    h: 100_100 + i * 10,
    l: 99_900 + i * 10,
    c: 100_050 + i * 10,
    v: 1_000,
  }));
}

describe('bucketStart', () => {
  it('minute 0 starts at session open for 5m', () => {
    const t = OPEN_MS;
    expect(bucketStart(t, '5m', SESSION_DATE)).toBe(OPEN_MS);
  });

  it('minute 4 rounds down to minute 0 for 5m', () => {
    const t = OPEN_MS + 4 * MIN_MS;
    expect(bucketStart(t, '5m', SESSION_DATE)).toBe(OPEN_MS);
  });

  it('minute 5 starts a new 5m bucket', () => {
    const t = OPEN_MS + 5 * MIN_MS;
    expect(bucketStart(t, '5m', SESSION_DATE)).toBe(OPEN_MS + 5 * MIN_MS);
  });

  it('minute 0 starts at session open for 15m', () => {
    const t = OPEN_MS;
    expect(bucketStart(t, '15m', SESSION_DATE)).toBe(OPEN_MS);
  });

  it('minute 14 rounds down to minute 0 for 15m', () => {
    const t = OPEN_MS + 14 * MIN_MS;
    expect(bucketStart(t, '15m', SESSION_DATE)).toBe(OPEN_MS);
  });

  it('minute 15 starts new 15m bucket', () => {
    const t = OPEN_MS + 15 * MIN_MS;
    expect(bucketStart(t, '15m', SESSION_DATE)).toBe(OPEN_MS + 15 * MIN_MS);
  });
});

describe('aggregate to 5m', () => {
  it('produces 75 bars from 375 1m candles', () => {
    const candles = makeCandles(375);
    const agg = aggregate(candles, '5m', SESSION_DATE);
    expect(agg.length).toBe(75);
  });

  it('first 5m bar opens at first 1m candle open', () => {
    const candles = makeCandles(10);
    const agg = aggregate(candles, '5m', SESSION_DATE);
    expect(agg[0].o).toBe(candles[0].o);
  });

  it('first 5m bar closes at 5th 1m candle close', () => {
    const candles = makeCandles(10);
    const agg = aggregate(candles, '5m', SESSION_DATE);
    expect(agg[0].c).toBe(candles[4].c);
  });

  it('high is max of all 1m highs in bucket', () => {
    const candles = makeCandles(5);
    candles[2].h = 200_000; // spike
    const agg = aggregate(candles, '5m', SESSION_DATE);
    expect(agg[0].h).toBe(200_000);
  });

  it('low is min of all 1m lows in bucket', () => {
    const candles = makeCandles(5);
    candles[3].l = 50_000; // dip
    const agg = aggregate(candles, '5m', SESSION_DATE);
    expect(agg[0].l).toBe(50_000);
  });

  it('volume is sum of all 1m volumes in bucket', () => {
    const candles = makeCandles(5);
    const agg = aggregate(candles, '5m', SESSION_DATE);
    expect(agg[0].v).toBe(5_000);
  });
});

describe('aggregate to 15m', () => {
  it('produces 25 bars from 375 1m candles', () => {
    const candles = makeCandles(375);
    const agg = aggregate(candles, '15m', SESSION_DATE);
    expect(agg.length).toBe(25);
  });
});

describe('fillGaps', () => {
  it('no-op when no gaps', () => {
    const candles = makeCandles(5);
    const filled = fillGaps(candles, SESSION_DATE);
    expect(filled.length).toBe(5);
    expect(filled.filter((c) => c.gap).length).toBe(0);
  });

  it('fills a single missing minute', () => {
    const candles = makeCandles(5);
    candles.splice(2, 1); // remove minute 2
    const filled = fillGaps(candles, SESSION_DATE);
    expect(filled.length).toBe(5);
    const gapCandle = filled[2];
    expect(gapCandle.gap).toBe(true);
    expect(gapCandle.v).toBe(0);
  });

  it('gap candle carries previous close as OHLC', () => {
    const candles = makeCandles(3);
    candles.splice(1, 1); // remove minute 1
    const filled = fillGaps(candles, SESSION_DATE);
    const gapCandle = filled.find((c) => c.gap);
    expect(gapCandle.o).toBe(candles[0].c);
    expect(gapCandle.c).toBe(candles[0].c);
  });
});
