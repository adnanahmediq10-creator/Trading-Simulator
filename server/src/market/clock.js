/**
 * Virtual market clock for Indian equities (NSE).
 * All IST logic is explicit; no dependency on server local timezone.
 *
 * IST = UTC + 05:30 (no DST ever).
 */
import { env } from '../config/env.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19800000
const DAY_MS = 24 * 60 * 60 * 1000;

/** Session open = 09:15 IST, session close = 15:30 IST */
export const SESSION_OPEN_MINUTES = 9 * 60 + 15; // 555
export const SESSION_CLOSE_MINUTES = 15 * 60 + 30; // 930
export const SESSION_MINUTES = SESSION_CLOSE_MINUTES - SESSION_OPEN_MINUTES; // 375
export const SESSION_MS = SESSION_MINUTES * 60_000;

// DELAYED_LIVE window: 09:30 IST (feed starts 15 min after open) to 15:45 IST (15 min after close)
const LIVE_WINDOW_START_MINUTES = SESSION_OPEN_MINUTES + 15; // 09:30
const LIVE_WINDOW_END_MINUTES = SESSION_CLOSE_MINUTES + 15; // 15:45

// ─────────────────────────────────────────────────────────────────────────────
// Pure IST helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Break a UTC-epoch ms into IST calendar parts.
 * @param {number} ms epoch milliseconds
 * @returns {{ year: number, month: number, day: number, dow: number, minuteOfDay: number }}
 */
export function istParts(ms) {
  const d = new Date(ms + IST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dow: d.getUTCDay(), // 0=Sun … 6=Sat
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/**
 * @param {number} [ms] epoch ms (default: now)
 * @returns {string} "YYYY-MM-DD" in IST
 */
export function istDateString(ms = Date.now()) {
  const d = new Date((ms ?? Date.now()) + IST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Epoch ms of IST midnight for a given "YYYY-MM-DD" string.
 * @param {string} dateStr
 * @returns {number}
 */
export function istMidnightMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
}

/**
 * Epoch ms of the session open (09:15 IST) for a given date string.
 * @param {string} dateStr
 * @returns {number}
 */
export function sessionOpenMs(dateStr) {
  return istMidnightMs(dateStr) + SESSION_OPEN_MINUTES * 60_000;
}

/** @param {number} ms */
export function isWeekend(ms) {
  const { dow } = istParts(ms);
  return dow === 0 || dow === 6;
}

/**
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {string[]} holidays array of "YYYY-MM-DD" strings
 */
export function isHoliday(dateStr, holidays) {
  return holidays.includes(dateStr);
}

/**
 * @param {string} dateStr
 * @param {string[]} holidays
 */
export function isTradingDay(dateStr, holidays) {
  const ms = istMidnightMs(dateStr) + IST_OFFSET_MS; // noon-ish IST on that date
  if (isWeekend(ms)) return false;
  if (isHoliday(dateStr, holidays)) return false;
  return true;
}

/**
 * Previous trading day strictly before dateStr.
 * @param {string} dateStr
 * @param {string[]} holidays
 * @returns {string}
 */
export function prevTradingDay(dateStr, holidays = []) {
  let ms = istMidnightMs(dateStr) - DAY_MS;
  for (let i = 0; i < 20; i++) {
    const d = istDateString(ms);
    if (isTradingDay(d, holidays)) return d;
    ms -= DAY_MS;
  }
  // Safety: should never reach here in 20 days
  throw new Error(`prevTradingDay: no trading day found before ${dateStr}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Load holiday list
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

let _holidays = /** @type {string[]} */ ([]);
try {
  const holidayFile = path.join(__dirname, '../../data/holidays.json');
  const data = _require(holidayFile);
  _holidays = Array.isArray(data.holidays) ? data.holidays : [];
} catch {
  _holidays = [];
}

export function getHolidays() {
  return _holidays;
}

// ─────────────────────────────────────────────────────────────────────────────
// getMode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {'DELAYED_LIVE'|'DEMO_REPLAY'} MarketMode
 * @typedef {{ mode: MarketMode, sessionDate: string, reason: string }} ModeInfo
 */

/**
 * Pure function — no I/O. Determine the clock mode given wall time.
 * @param {number} nowMs wall-clock epoch ms
 * @param {string[]} holidays
 * @returns {ModeInfo}
 */
export function getMode(nowMs, holidays = _holidays) {
  const dateStr = istDateString(nowMs);
  const { dow, minuteOfDay } = istParts(nowMs);

  const isTradDay = !isWeekend(nowMs) && !isHoliday(dateStr, holidays);

  if (
    isTradDay &&
    minuteOfDay >= LIVE_WINDOW_START_MINUTES &&
    minuteOfDay < LIVE_WINDOW_END_MINUTES
  ) {
    return {
      mode: 'DELAYED_LIVE',
      sessionDate: dateStr,
      reason: 'weekday_live_window',
    };
  }

  // DEMO_REPLAY — find the most recent completed session
  let sessionDate;
  if (isTradDay && minuteOfDay >= LIVE_WINDOW_END_MINUTES) {
    // After 15:45 today, today's session is complete
    sessionDate = dateStr;
  } else {
    // Before market opens, weekend, or holiday → use previous trading day
    sessionDate = prevTradingDay(dateStr, holidays);
  }

  const reason = !isTradDay
    ? isWeekend(nowMs)
      ? 'weekend'
      : 'holiday'
    : minuteOfDay < LIVE_WINDOW_START_MINUTES
      ? 'before_market_open'
      : 'after_market_close';

  return { mode: 'DEMO_REPLAY', sessionDate, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// getVirtualTime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ virtualNowMs: number, sessionEpoch: string }} VirtualTime
 */

/**
 * Stateless, deterministic virtual-time computation.
 * @param {number} nowMs wall-clock epoch ms
 * @param {ModeInfo} modeInfo
 * @param {number} speed replay speed (1..60, DEMO_REPLAY only)
 * @returns {VirtualTime}
 */
export function getVirtualTime(nowMs, modeInfo, speed = env.REPLAY_SPEED) {
  const clampedSpeed = Math.max(1, Math.min(60, Math.round(speed)));

  if (modeInfo.mode === 'DELAYED_LIVE') {
    const delayMs = env.LIVE_DELAY_MINUTES * 60_000;
    return {
      virtualNowMs: nowMs - delayMs,
      sessionEpoch: `DELAYED_LIVE:${modeInfo.sessionDate}:0`,
    };
  }

  // DEMO_REPLAY
  const elapsed = nowMs * clampedSpeed; // total virtual ms elapsed since epoch
  const offset = elapsed % SESSION_MS;
  const loopIndex = Math.floor(elapsed / SESSION_MS);
  const openMs = sessionOpenMs(modeInfo.sessionDate);
  return {
    virtualNowMs: openMs + offset,
    sessionEpoch: `DEMO_REPLAY:${modeInfo.sessionDate}:${loopIndex}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective mode (with live-data degradation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps getMode and applies the "live data unavailable" degradation:
 * if the clock says DELAYED_LIVE but the caller signals no live data,
 * we downgrade to DEMO_REPLAY with an appropriate reason.
 *
 * @param {number} nowMs
 * @param {string[]} holidays
 * @param {boolean} liveDataAvailable
 * @returns {ModeInfo & { effectiveMode: MarketMode }}
 */
export function getEffectiveMode(nowMs, holidays = _holidays, liveDataAvailable = true) {
  const modeInfo = getMode(nowMs, holidays);
  if (modeInfo.mode === 'DELAYED_LIVE' && !liveDataAvailable) {
    const fallback = getMode(
      istMidnightMs(modeInfo.sessionDate) + (LIVE_WINDOW_END_MINUTES - 1) * 60_000,
      holidays,
    );
    return {
      ...fallback,
      mode: 'DELAYED_LIVE',
      effectiveMode: 'DEMO_REPLAY',
      reason: 'live_data_unavailable',
    };
  }
  return { ...modeInfo, effectiveMode: modeInfo.mode };
}
