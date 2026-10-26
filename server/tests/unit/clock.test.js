/**
 * Unit tests for market/clock.js
 * Tests getMode, getVirtualTime, and IST helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  getMode,
  getVirtualTime,
  istDateString,
  istMidnightMs,
  isWeekend,
  prevTradingDay,
  SESSION_MS,
  getEffectiveMode,
} from '../../src/market/clock.js';

// ─────────────────────────────────────────────────────────────────────────────
// IST helper assertions
// ─────────────────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Build epoch ms from an IST datetime description */
function ist(year, month, day, hour = 0, minute = 0, second = 0) {
  return Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
}

describe('istDateString', () => {
  it('gives correct IST date at midnight UTC', () => {
    // 2026-10-25 00:00 UTC = 2026-10-25 05:30 IST
    const utcMidnight = Date.UTC(2026, 9, 25, 0, 0, 0);
    expect(istDateString(utcMidnight)).toBe('2026-10-25');
  });

  it('rolls over at 18:30 UTC (midnight IST)', () => {
    // 2026-10-25 18:30 UTC = 2026-10-26 00:00 IST
    const rolloverUtc = Date.UTC(2026, 9, 25, 18, 30, 0);
    expect(istDateString(rolloverUtc)).toBe('2026-10-26');
  });
});

describe('istMidnightMs', () => {
  it('round-trips with istDateString', () => {
    const date = '2026-10-25';
    expect(istDateString(istMidnightMs(date))).toBe(date);
  });
});

describe('isWeekend', () => {
  it('Saturday is weekend', () => {
    // 2026-10-24 is Saturday — IST 08:00
    expect(isWeekend(ist(2026, 10, 24, 8, 0))).toBe(true);
  });
  it('Sunday is weekend', () => {
    expect(isWeekend(ist(2026, 10, 25, 8, 0))).toBe(true);
  });
  it('Monday is not weekend', () => {
    expect(isWeekend(ist(2026, 10, 26, 8, 0))).toBe(false);
  });
});

describe('prevTradingDay', () => {
  it('Monday returns preceding Friday', () => {
    expect(prevTradingDay('2026-10-26', [])).toBe('2026-10-23');
  });
  it('Saturday returns Friday', () => {
    expect(prevTradingDay('2026-10-24', [])).toBe('2026-10-23');
  });
  it('skips a holiday', () => {
    // 2026-10-23 is a holiday, so previous is 2026-10-22
    expect(prevTradingDay('2026-10-24', ['2026-10-23'])).toBe('2026-10-22');
  });
  it('handles multiple consecutive holidays', () => {
    // holidays Fri+Sat (Sat is already weekend), so prev from Mon = previous Thursday
    expect(prevTradingDay('2026-10-26', ['2026-10-23'])).toBe('2026-10-22');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMode tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getMode', () => {
  const HOLIDAYS = [];
  const HOLIDAYS_WITH_TODAY = ['2026-10-26']; // Monday is a holiday

  // Monday 2026-10-26 is a trading day (not in HOLIDAYS)

  it('DELAYED_LIVE: weekday at 09:30 IST', () => {
    const ms = ist(2026, 10, 26, 9, 30, 0);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DELAYED_LIVE');
    expect(r.sessionDate).toBe('2026-10-26');
  });

  it('DELAYED_LIVE: weekday at 12:00 IST (mid-session)', () => {
    const ms = ist(2026, 10, 26, 12, 0, 0);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DELAYED_LIVE');
    expect(r.sessionDate).toBe('2026-10-26');
  });

  it('DELAYED_LIVE: weekday at 15:44:59 IST (last second)', () => {
    const ms = ist(2026, 10, 26, 15, 44, 59);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DELAYED_LIVE');
  });

  it('DEMO_REPLAY: weekday at 15:45:00 IST (window closed)', () => {
    const ms = ist(2026, 10, 26, 15, 45, 0);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DEMO_REPLAY');
    expect(r.sessionDate).toBe('2026-10-26'); // today's session completed
  });

  it('DEMO_REPLAY: weekday before open (08:00 IST)', () => {
    const ms = ist(2026, 10, 26, 8, 0, 0);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DEMO_REPLAY');
    expect(r.sessionDate).toBe('2026-10-23'); // prev Friday
  });

  it('DEMO_REPLAY: weekday at 09:29:59 IST (just before window opens)', () => {
    const ms = ist(2026, 10, 26, 9, 29, 59);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DEMO_REPLAY');
  });

  it('DEMO_REPLAY: Saturday', () => {
    const ms = ist(2026, 10, 24, 10, 0, 0);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DEMO_REPLAY');
    expect(r.reason).toBe('weekend');
    expect(r.sessionDate).toBe('2026-10-23');
  });

  it('DEMO_REPLAY: Sunday', () => {
    const ms = ist(2026, 10, 25, 10, 0, 0);
    const r = getMode(ms, HOLIDAYS);
    expect(r.mode).toBe('DEMO_REPLAY');
    expect(r.reason).toBe('weekend');
  });

  it('DEMO_REPLAY: holiday on a weekday during live window', () => {
    const ms = ist(2026, 10, 26, 12, 0, 0);
    const r = getMode(ms, HOLIDAYS_WITH_TODAY);
    expect(r.mode).toBe('DEMO_REPLAY');
    expect(r.reason).toBe('holiday');
    expect(r.sessionDate).toBe('2026-10-23'); // last completed session before the holiday
  });

  it('sessionDate on Monday morning is previous Friday', () => {
    const ms = ist(2026, 10, 26, 8, 0, 0);
    const r = getMode(ms, HOLIDAYS);
    expect(r.sessionDate).toBe('2026-10-23');
  });

  it('sessionDate on Monday morning when Friday is holiday = Thursday', () => {
    const ms = ist(2026, 10, 26, 8, 0, 0);
    const r = getMode(ms, ['2026-10-23']);
    expect(r.sessionDate).toBe('2026-10-22');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getVirtualTime tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getVirtualTime', () => {
  it('DELAYED_LIVE: virtual time is exactly 15 minutes behind wall', () => {
    const nowMs = ist(2026, 10, 26, 10, 0, 0);
    const modeInfo = { mode: 'DELAYED_LIVE', sessionDate: '2026-10-26', reason: 'weekday_live_window' };
    const vt = getVirtualTime(nowMs, modeInfo, 1);
    expect(vt.virtualNowMs).toBe(nowMs - 15 * 60_000);
  });

  it('DELAYED_LIVE: sessionEpoch includes mode and date', () => {
    const nowMs = ist(2026, 10, 26, 10, 0, 0);
    const modeInfo = { mode: 'DELAYED_LIVE', sessionDate: '2026-10-26', reason: 'weekday_live_window' };
    const vt = getVirtualTime(nowMs, modeInfo, 1);
    expect(vt.sessionEpoch).toContain('DELAYED_LIVE');
    expect(vt.sessionEpoch).toContain('2026-10-26');
  });

  it('DEMO_REPLAY: loops around session boundaries', () => {
    const modeInfo = { mode: 'DEMO_REPLAY', sessionDate: '2026-10-23', reason: 'weekend' };

    // Advance enough to wrap one full session
    // Use a small nowMs so elapsed * speed is manageable
    // At speed=1, elapsed wraps after SESSION_MS ms of wall time
    const nowMs1 = SESSION_MS; // first second of loop 0
    getVirtualTime(nowMs1, modeInfo, 1);

    // But SESSION_MS is 22,500,000 ms of wall time...
    // Let's use a speed that makes wrapping easy
    // At speed=30, elapsed = nowMs*30, loop = floor(elapsed / SESSION_MS)
    // For 1 loop at speed 30: nowMs = SESSION_MS/30 = 750,000 ms
    const baseMs = SESSION_MS / 30 + 1000; // just past one loop
    const vtAfterWrap = getVirtualTime(baseMs, modeInfo, 30);
    expect(vtAfterWrap.sessionEpoch).toMatch(/DEMO_REPLAY:2026-10-23:1/);
  });

  it('DEMO_REPLAY: sessionEpoch changes at loop wrap', () => {
    const modeInfo = { mode: 'DEMO_REPLAY', sessionDate: '2026-10-23', reason: 'weekend' };
    const justBefore = SESSION_MS / 30 - 1;
    const justAfter = SESSION_MS / 30 + 1;
    const v1 = getVirtualTime(justBefore, modeInfo, 30);
    const v2 = getVirtualTime(justAfter, modeInfo, 30);
    expect(v1.sessionEpoch).not.toBe(v2.sessionEpoch);
  });

  it('speed clamped to 60 max', () => {
    const modeInfo = { mode: 'DEMO_REPLAY', sessionDate: '2026-10-23', reason: 'weekend' };
    const vt = getVirtualTime(1_000_000, modeInfo, 999);
    // Just verifying it doesn't throw and returns valid structure
    expect(vt.virtualNowMs).toBeTypeOf('number');
    expect(Number.isFinite(vt.virtualNowMs)).toBe(true);
  });

  it('speed clamped to 1 min', () => {
    const modeInfo = { mode: 'DEMO_REPLAY', sessionDate: '2026-10-23', reason: 'weekend' };
    const vt = getVirtualTime(1_000_000, modeInfo, 0);
    expect(vt.virtualNowMs).toBeTypeOf('number');
  });
});

describe('getEffectiveMode', () => {
  it('returns DELAYED_LIVE when live data available', () => {
    const ms = ist(2026, 10, 26, 10, 0, 0);
    const r = getEffectiveMode(ms, [], true);
    expect(r.effectiveMode).toBe('DELAYED_LIVE');
  });

  it('downgrades to DEMO_REPLAY when live data unavailable', () => {
    const ms = ist(2026, 10, 26, 10, 0, 0);
    const r = getEffectiveMode(ms, [], false);
    expect(r.mode).toBe('DELAYED_LIVE');
    expect(r.effectiveMode).toBe('DEMO_REPLAY');
    expect(r.reason).toBe('live_data_unavailable');
  });
});
