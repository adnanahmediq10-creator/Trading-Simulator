/**
 * Ingest job — fetches Yahoo Finance 1m + 1d candles and upserts into MongoDB.
 *
 * Schedule:
 *   - At boot (if INGEST_ENABLED)
 *   - Refresh 1m candles every 2 minutes during DELAYED_LIVE
 *   - Fetch daily history at most once per IST calendar day
 *
 * Safety:
 *   - All Yahoo calls go through the circuit breaker
 *   - Errors never crash the process or block serving
 *   - Uses bulkWrite upsert for idempotency
 */
import yahooFinance from 'yahoo-finance2';
import { Candle } from '../models/Candle.js';
import { INSTRUMENTS } from '../config/instruments.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { getEffectiveMode, getHolidays, istDateString } from './clock.js';
import { setBreakerState } from '../routes/health.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { priceService } from './priceService.js';

const SLEEP_BETWEEN_SYMBOLS_MS = 500;

const breaker = new CircuitBreaker('yahoo-ingest');

let _intervalId = null;
let _ingestRunning = false;
let _dailyFetchDate = null;
const _dailyFetchedSymbols = new Set();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Yahoo fetch helpers ───────────────────────────────────────────────────────

async function fetchMinutes(yahoo, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const period1 = new Date(Date.UTC(y, m - 1, d) - 5.5 * 3600 * 1000); // IST midnight
  const period2 = new Date(period1.getTime() + 24 * 60 * 60 * 1000);

  return breaker.execute(async () => {
    const r = await yahooFinance.chart(yahoo, {
      period1,
      period2,
      interval: '1m',
      includePrePost: false,
    });
    return r.quotes ?? [];
  });
}

async function fetchDaily(yahoo, days = 365) {
  const period1 = new Date(Date.now() - days * 24 * 3600 * 1000);
  const period2 = new Date();

  return breaker.execute(async () => {
    const r = await yahooFinance.chart(yahoo, {
      period1,
      period2,
      interval: '1d',
      includePrePost: false,
    });
    return r.quotes ?? [];
  });
}

// ── Upsert candles ────────────────────────────────────────────────────────────

async function upsertCandles(symbol, interval, rawQuotes) {
  if (!rawQuotes || rawQuotes.length === 0) return 0;

  const ops = rawQuotes
    .filter((q) => q.close != null && q.date != null)
    .map((q) => {
      const t = q.date instanceof Date ? q.date.getTime() : Number(q.date);
      return {
        updateOne: {
          filter: { symbol, interval, t },
          update: {
            $set: {
              o: Math.round(q.open * 100),
              h: Math.round(q.high * 100),
              l: Math.round(q.low * 100),
              c: Math.round(q.close * 100),
              v: q.volume ?? 0,
            },
          },
          upsert: true,
        },
      };
    });

  if (ops.length === 0) return 0;
  const result = await Candle.bulkWrite(ops, { ordered: false });
  return result.upsertedCount + result.modifiedCount;
}

// ── Main ingest function ──────────────────────────────────────────────────────

export async function runIngest() {
  if (!env.INGEST_ENABLED || _ingestRunning) return;
  _ingestRunning = true;

  try {
    await runIngestCycle();
  } finally {
    _ingestRunning = false;
  }
}

async function runIngestCycle() {

  const nowMs = Date.now();
  const holidays = getHolidays();
  const modeInfo = getEffectiveMode(nowMs, holidays, true);
  const today = istDateString(nowMs);
  const sessionDate = modeInfo.mode === 'DELAYED_LIVE' ? today : modeInfo.sessionDate;

  if (_dailyFetchDate !== today) {
    _dailyFetchDate = today;
    _dailyFetchedSymbols.clear();
  }

  if (modeInfo.mode !== 'DELAYED_LIVE' && _dailyFetchedSymbols.size === INSTRUMENTS.length) {
    return;
  }

  logger.info({ sessionDate, mode: modeInfo.mode }, 'Ingest: starting');

  let totalUpserted = 0;

  for (const inst of INSTRUMENTS) {
    try {
      // 1m candles are refreshed only while the delayed live market is active.
      if (modeInfo.mode === 'DELAYED_LIVE') {
        const quotes1m = await fetchMinutes(inst.yahoo, sessionDate);
        totalUpserted += await upsertCandles(inst.symbol, '1m', quotes1m);
        await sleep(SLEEP_BETWEEN_SYMBOLS_MS);
      }

      // Daily history changes once per trading day; avoid downloading 365 days on
      // every two-minute intraday refresh. Failed symbols remain eligible to retry.
      if (!_dailyFetchedSymbols.has(inst.symbol)) {
        const quotesDaily = await fetchDaily(inst.yahoo, 365);
        totalUpserted += await upsertCandles(inst.symbol, '1d', quotesDaily);
        _dailyFetchedSymbols.add(inst.symbol);
      }

      await sleep(SLEEP_BETWEEN_SYMBOLS_MS);
    } catch (err) {
      logger.warn({ symbol: inst.symbol, err: err.message }, 'Ingest: symbol failed');
    }

    // Update health breaker state
    setBreakerState(breaker.getState());
  }

  logger.info({ totalUpserted }, 'Ingest: complete');
  if (modeInfo.mode === 'DELAYED_LIVE') {
    await priceService.refreshSession(sessionDate);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function startIngest() {
  if (!env.INGEST_ENABLED) {
    logger.info('Ingest disabled (INGEST_ENABLED=false)');
    return;
  }

  // Immediate first run
  runIngest().catch((err) => logger.error({ err: err.message }, 'Ingest boot run failed'));

  // Schedule: every 2 minutes, but only actually fetch during live window
  _intervalId = setInterval(() => {
    runIngest().catch((err) => logger.error({ err: err.message }, 'Scheduled ingest failed'));
  }, 2 * 60 * 1000);

  logger.info('Ingest scheduler started (every 2 minutes)');
}

export function stopIngest() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    logger.info('Ingest scheduler stopped');
  }
}
