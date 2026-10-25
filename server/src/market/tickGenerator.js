/**
 * Tick generator: converts a 1-minute OHLCV candle into a deterministic
 * per-second price using a seeded PRNG and waypoint interpolation.
 *
 * Contract:
 *   - tickAt(symbol, candle, 0)  === candle.o
 *   - tickAt(symbol, candle, 59) === candle.c
 *   - All ticks are in [candle.l, candle.h]
 *   - All ticks are multiples of 5 paise
 *   - The scan across seconds 0..59 visits both candle.h and candle.l
 *   - Results are fully deterministic for equal inputs
 */
import { cyrb53, mulberry32 } from '../utils/prng.js';

const TICK_SIZE = 5; // paise

/** @param {number} paise */
function roundTick(paise) {
  return Math.max(TICK_SIZE, Math.round(paise / TICK_SIZE) * TICK_SIZE);
}

/** Linear interpolation */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Build the 4-waypoint path for a candle.
 * Waypoints: [ [u, price], ... ]  u in [0,1]
 *
 * @param {{ o:number, h:number, l:number, c:number }} candle
 * @param {() => number} rand seeded PRNG
 * @returns {{ points: [number, number][], highFirst: boolean }}
 */
function buildWaypoints(candle, rand) {
  const { o, h, l, c } = candle;
  const highFirst = rand() < 0.5;
  const firstExtreme = highFirst ? h : l;
  const secondExtreme = highFirst ? l : h;

  // Spread waypoints in non-overlapping zones
  const u1 = 0.2 + rand() * 0.2; // [0.2, 0.4]
  const u2 = 0.55 + rand() * 0.25; // [0.55, 0.80]

  return {
    points: [
      [0, o],
      [u1, firstExtreme],
      [u2, secondExtreme],
      [1, c],
    ],
    highFirst,
  };
}

/**
 * Find which segment u falls in and linearly interpolate.
 * @param {[number,number][]} points sorted by u
 * @param {number} u progress in [0,1]
 * @returns {number}
 */
function interpolate(points, u) {
  for (let i = 0; i < points.length - 1; i++) {
    const [u0, p0] = points[i];
    const [u1, p1] = points[i + 1];
    if (u <= u1 + 1e-9) {
      if (Math.abs(u1 - u0) < 1e-12) return p1;
      const t = (u - u0) / (u1 - u0);
      return lerp(p0, p1, t);
    }
  }
  return points[points.length - 1][1];
}

/**
 * Deterministic noise at a specific second, tapered to 0 near waypoints.
 * @param {number} seed
 * @param {number} secIdx 0..59
 * @param {[number,number][]} points waypoints
 * @param {number} amplitude paise
 * @returns {number}
 */
function noise(seed, secIdx, points, amplitude) {
  if (amplitude === 0) return 0;
  const u = secIdx / 59;

  // Taper: sine of minimum angular distance to any waypoint
  let minDist = 1;
  for (const [wu] of points) {
    minDist = Math.min(minDist, Math.abs(u - wu));
  }
  // Map to [0,1], with 0.05 band around waypoints
  const taper = Math.min(1, minDist / 0.05);
  if (taper < 1e-6) return 0;

  // Hash the (seed, secIdx) into [-1,1]
  const h = mulberry32(cyrb53(`${seed}:${secIdx}`))();
  const direction = h * 2 - 1;
  return direction * amplitude * taper;
}

/**
 * Compute the tick price for one second inside a candle.
 *
 * @param {string} symbol
 * @param {{ t: number, o: number, h: number, l: number, c: number, v: number }} candle
 * @param {number} secIdx 0..59
 * @returns {number} price in paise, multiple of 5
 */
export function tickAt(symbol, candle, secIdx) {
  const { o, h, l, c } = candle;
  const seedStr = `${symbol}:${candle.t}`;
  const seed = cyrb53(seedStr);
  const rand = mulberry32(seed);

  const { points } = buildWaypoints(candle, rand);

  // At exact waypoint seconds, snap to waypoint value
  const u = secIdx / 59;
  for (const [wu, wp] of points) {
    if (Math.abs(u - wu) < 1e-9) {
      return roundTick(wp);
    }
  }

  const basePrice = interpolate(points, u);

  const spread = h - l;
  const amplitude = spread > 0 ? 0.12 * spread : 0;
  const noiseVal = noise(seed, secIdx, points, amplitude);

  let price = basePrice + noiseVal;
  price = Math.max(l, Math.min(h, price));
  price = roundTick(price);
  price = Math.max(l <= h ? roundTick(Math.min(l + TICK_SIZE, h)) : l, Math.min(h, price));
  // Re-clamp after rounding
  price = Math.max(roundTick(l), Math.min(roundTick(h), price));
  // Final safety clamp to [l, h]
  if (price < l) price = roundTick(l);
  if (price > h) price = roundTick(h > 0 ? h : l);
  return price;
}

/**
 * Build the "forming" bar by scanning seconds 0..uptoSec.
 * This must be called with ALL elapsed seconds (not just sampled ones)
 * because it computes high/low accurately.
 *
 * @param {string} symbol
 * @param {{ t: number, o: number, h: number, l: number, c: number, v: number }} candle
 * @param {number} uptoSec inclusive, 0..59
 * @returns {{ t: number, o: number, h: number, l: number, c: number, v: number }}
 */
export function formingBar(symbol, candle, uptoSec) {
  const sec = Math.max(0, Math.min(59, uptoSec));
  let hi = -Infinity;
  let lo = Infinity;
  let close = candle.o;

  for (let s = 0; s <= sec; s++) {
    const p = tickAt(symbol, candle, s);
    if (s === 0) {
      hi = p;
      lo = p;
    } else {
      hi = Math.max(hi, p);
      lo = Math.min(lo, p);
    }
    close = p;
  }

  const open = tickAt(symbol, candle, 0);
  return {
    t: candle.t,
    o: open,
    h: hi,
    l: lo,
    c: close,
    v: Math.round((candle.v * (sec + 1)) / 60),
  };
}
