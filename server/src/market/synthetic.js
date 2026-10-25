import { cyrb53, mulberry32 } from '../utils/prng.js';

export const SESSION_MINUTES = 375;
const MINUTE_MS = 60_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SESSION_OPEN_MINUTES = 9 * 60 + 15;

/** @param {string} dateStr YYYY-MM-DD IST session date */
export function sessionOpenMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - IST_OFFSET_MS + SESSION_OPEN_MINUTES * MINUTE_MS;
}

/**
 * @param {string} symbol
 * @param {string} sessionDate
 * @param {number} startClosePaise
 * @returns {{ t: number, o: number, h: number, l: number, c: number, v: number }[]}
 */
export function generateSession(symbol, sessionDate, startClosePaise) {
  const rand = mulberry32(cyrb53(`${symbol}:${sessionDate}:session`));
  const openMs = sessionOpenMs(sessionDate);
  let prevClose = startClosePaise;
  const candles = [];

  for (let i = 0; i < SESSION_MINUTES; i++) {
    const drift = (rand() - 0.5) * 0.004;
    const o = prevClose;
    let c = Math.round(o * (1 + drift));
    const wick = Math.max(5, Math.round(o * (0.001 + rand() * 0.002)));
    let h = Math.max(o, c) + Math.round(wick * rand());
    let l = Math.min(o, c) - Math.round(wick * rand());
    c = roundTick(c);
    h = roundTick(Math.max(h, o, c));
    l = roundTick(Math.min(l, o, c));
    const v = Math.round(10_000 + rand() * 500_000);
    candles.push({ t: openMs + i * MINUTE_MS, o, h, l, c, v });
    prevClose = c;
  }
  return candles;
}

/**
 * @param {string} symbol
 * @param {number} basePricePaise
 * @param {number} days
 */
export function generateDaily(symbol, basePricePaise, days = 252) {
  const rand = mulberry32(cyrb53(`${symbol}:daily`));
  const out = [];
  let close = basePricePaise;
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  for (let i = 0; i < days; i++) {
    const t = start + i * 24 * 60 * 60 * 1000;
    const o = close;
    const drift = (rand() - 0.5) * 0.02;
    close = roundTick(Math.round(o * (1 + drift)));
    const h = roundTick(Math.max(o, close) + Math.round(Math.abs(close - o) * rand()));
    const l = roundTick(Math.min(o, close) - Math.round(Math.abs(close - o) * rand()));
    out.push({ t, o, h, l, c: close, v: Math.round(1_000_000 + rand() * 5_000_000) });
  }
  return out;
}

/** @param {number} paise */
function roundTick(paise) {
  return Math.max(5, Math.round(paise / 5) * 5);
}
