/**
 * Candle aggregation utilities.
 * Aggregates 1-minute candles into 5m, 15m, or 1D intervals.
 * All timestamps are epoch ms UTC (candle start times).
 */
import { sessionOpenMs } from './clock.js';

const MINUTE_MS = 60_000;

/** Supported aggregation intervals */
export const INTERVALS = ['1m', '5m', '15m', '1D'];

/**
 * Return the bucket-start epoch ms for a given interval, aligned to 09:15 IST.
 * @param {number} tMs candle start epoch ms
 * @param {string} interval '1m'|'5m'|'15m'
 * @param {string} sessionDate 'YYYY-MM-DD'
 * @returns {number}
 */
export function bucketStart(tMs, interval, sessionDate) {
  const openMs = sessionOpenMs(sessionDate);
  const offsetMs = tMs - openMs;
  let bucketMs;
  switch (interval) {
    case '1m':
      bucketMs = MINUTE_MS;
      break;
    case '5m':
      bucketMs = 5 * MINUTE_MS;
      break;
    case '15m':
      bucketMs = 15 * MINUTE_MS;
      break;
    default:
      bucketMs = MINUTE_MS;
  }
  return openMs + Math.floor(offsetMs / bucketMs) * bucketMs;
}

/**
 * Aggregate an array of 1m candles into a larger interval.
 * Input candles must be sorted by t ascending.
 *
 * @param {{ t:number,o:number,h:number,l:number,c:number,v:number }[]} candles1m
 * @param {'5m'|'15m'} interval
 * @param {string} sessionDate 'YYYY-MM-DD'
 * @returns {{ t:number,o:number,h:number,l:number,c:number,v:number }[]}
 */
export function aggregate(candles1m, interval, sessionDate) {
  if (!candles1m || candles1m.length === 0) return [];

  /** @type {Map<number, {t:number,o:number,h:number,l:number,c:number,v:number}>} */
  const buckets = new Map();

  for (const c of candles1m) {
    const bStart = bucketStart(c.t, interval, sessionDate);
    if (!buckets.has(bStart)) {
      buckets.set(bStart, { t: bStart, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
    } else {
      const b = buckets.get(bStart);
      b.h = Math.max(b.h, c.h);
      b.l = Math.min(b.l, c.l);
      b.c = c.c;
      b.v += c.v;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}

/**
 * Fill gaps in a 1m candle array by inserting flat candles for missing minutes.
 * Gaps are filled with prevClose as o,h,l,c and v=0, flagged gap:true.
 *
 * @param {{ t:number,o:number,h:number,l:number,c:number,v:number }[]} candles sorted asc
 * @param {string} sessionDate 'YYYY-MM-DD'
 * @returns {{ t:number,o:number,h:number,l:number,c:number,v:number,gap?:boolean }[]}
 */
export function fillGaps(candles, _sessionDate) {
  if (!candles || candles.length === 0) return [];
  // session spans the regular trading window and may require gap filling.
  // Let's just use the actual first/last from input
  const result = [];
  let prev = candles[0];
  result.push(prev);

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    let gap = prev.t + MINUTE_MS;
    while (gap < curr.t) {
      result.push({ t: gap, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0, gap: true });
      gap += MINUTE_MS;
    }
    result.push(curr);
    prev = curr;
  }
  return result;
}

/**
 * Build the "forming" daily bar from the 1m candles seen so far.
 * Open = first candle's open, high/low/close from accumulated 1m candles.
 *
 * @param {{ t:number,o:number,h:number,l:number,c:number,v:number }[]} candles1m
 * @param {string} sessionDate
 * @returns {{ t:number,o:number,h:number,l:number,c:number,v:number } | null}
 */
export function formingDailyBar(candles1m, sessionDate) {
  if (!candles1m || candles1m.length === 0) return null;
  const dayStart = sessionOpenMs(sessionDate);
  let o = candles1m[0].o;
  let h = -Infinity;
  let l = Infinity;
  let c = candles1m[0].c;
  let v = 0;

  for (const bar of candles1m) {
    h = Math.max(h, bar.h);
    l = Math.min(l, bar.l);
    c = bar.c;
    v += bar.v;
  }
  return { t: dayStart, o, h: h === -Infinity ? o : h, l: l === Infinity ? o : l, c, v };
}

export { sessionOpenMs };
