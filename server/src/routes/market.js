/**
 * GET /api/market/status
 * GET /api/market/instruments
 * GET /api/market/quotes
 * GET /api/market/candles?symbol=&interval=&limit=
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { INSTRUMENTS, getInstrument } from '../config/instruments.js';
import { priceService } from '../market/priceService.js';
import { getHolidays, prevTradingDay, sessionOpenMs } from '../market/clock.js';
import { getSession, getDaily } from '../market/candleStore.js';
import { aggregate, formingDailyBar } from '../market/candles.js';
import { formingBar } from '../market/tickGenerator.js';
import { getMarketClock } from '../market/marketClock.js';
import { env } from '../config/env.js';
import { DomainError } from '../engine/errors.js';

export const marketRouter = Router();

// ── GET /api/market/status ────────────────────────────────────────────────────
marketRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const nowMs = Date.now();
    const marketClock = getMarketClock(nowMs);
    const { virtualNowMs, sessionEpoch, sessionDate } = marketClock;
    const sources = Object.values(priceService.getDataSources());
    const dataSource = sources.includes('db')
      ? 'db'
      : sources.includes('snapshot')
        ? 'snapshot'
        : 'synthetic';

    res.json({
      mode: marketClock.mode,
      effectiveMode: marketClock.effectiveMode ?? marketClock.mode,
      reason: marketClock.reason,
      sessionDate,
      virtualNowMs,
      speed: marketClock.speed ?? env.REPLAY_SPEED,
      sessionEpoch,
      dataSource,
      delayMinutes: env.LIVE_DELAY_MINUTES,
      disclaimer: 'Simulation only. Virtual money. Not financial advice.',
    });
  }),
);

// ── GET /api/market/instruments ──────────────────────────────────────────────
marketRouter.get('/instruments', (_req, res) => {
  res.json({ instruments: INSTRUMENTS });
});

// ── GET /api/market/quotes ────────────────────────────────────────────────────
marketRouter.get(
  '/quotes',
  asyncHandler(async (_req, res) => {
    const quotes = INSTRUMENTS.map((inst) => {
      const tick = priceService.getLatest(inst.symbol);
      const stale = priceService.isStale(inst.symbol);

      if (!tick) {
        return {
          symbol: inst.symbol,
          name: inst.name,
          type: inst.type,
          tradable: inst.tradable,
          pricePaise: null,
          prevClosePaise: null,
          changePaise: null,
          changePct: null,
          stale: true,
        };
      }

      const changePaise = tick.pricePaise - (tick.prevClosePaise ?? tick.pricePaise);
      const changePct =
        tick.prevClosePaise && tick.prevClosePaise !== 0
          ? (changePaise / tick.prevClosePaise) * 100
          : 0;

      return {
        symbol: inst.symbol,
        name: inst.name,
        type: inst.type,
        tradable: inst.tradable,
        pricePaise: tick.pricePaise,
        prevClosePaise: tick.prevClosePaise,
        changePaise,
        changePct: Math.round(changePct * 100) / 100,
        vts: tick.vts,
        source: tick.source,
        stale,
      };
    });

    res.json({ quotes });
  }),
);

// ── GET /api/market/candles ───────────────────────────────────────────────────
const candleQuerySchema = z.object({
  symbol: z.string().min(1),
  interval: z.enum(['1m', '5m', '15m', '1D']),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

marketRouter.get(
  '/candles',
  asyncHandler(async (req, res) => {
    const parsed = candleQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 'Invalid query parameters', {
        details: parsed.error.flatten(),
      });
    }

    const { symbol, interval, limit } = parsed.data;
    const inst = getInstrument(symbol);
    if (!inst) {
      throw new DomainError('INSTRUMENT_NOT_FOUND', `Unknown symbol: ${symbol}`);
    }

    const nowMs = Date.now();
    const { virtualNowMs, sessionDate } = getMarketClock(nowMs);
    const holidays = getHolidays();
    const openMs = sessionOpenMs(sessionDate);

    // Current virtual minute index
    const virtualOffsetMs = virtualNowMs - openMs;
    const currentMinuteIdx = Math.max(
      0,
      Math.min(374, Math.floor(virtualOffsetMs / 60_000)),
    );
    const currentSecIdx = Math.min(59, Math.max(0, Math.floor((virtualOffsetMs % 60_000) / 1000)));

    if (interval === '1D') {
      return handleDailyCandles(res, symbol, sessionDate, virtualNowMs, limit);
    }

    // 1m, 5m, 15m: load current session 1m candles
    // Previous session for context (fill the chart)
    const prevDate = prevTradingDay(sessionDate, holidays);

    let allCandles = [];
    let source = 'synthetic';

    // Previous session
    const prevResult = await getSession(symbol, prevDate);
    allCandles = prevResult.candles;
    source = prevResult.source;

    // Current session up to (but not including) the forming minute
    const currResult = await getSession(symbol, sessionDate);
    const completedCurrent = currResult.candles.slice(0, currentMinuteIdx);
    if (currResult.source === 'db') source = 'db';
    else if (currResult.source === 'snapshot' && source === 'synthetic') source = 'snapshot';

    allCandles = [...allCandles, ...completedCurrent];

    let forming = null;
    if (currResult.candles[currentMinuteIdx]) {
      const currentCandle = currResult.candles[currentMinuteIdx];
      forming = formingBar(symbol, currentCandle, currentSecIdx);

      // For multi-minute intervals, also include partially completed buckets
      if (interval !== '1m') {
        // Aggregate all 1m candles + forming

        // Build forming bucket from completed 1m candles in current minute's bucket
        const INTERVAL_MS = interval === '5m' ? 5 * 60_000 : 15 * 60_000;
        const bucketOpenMs = openMs + Math.floor(currentMinuteIdx / (INTERVAL_MS / 60_000)) * INTERVAL_MS;
        const inBucket = completedCurrent.filter((c) => c.t >= bucketOpenMs);

        // Re-aggregate previous + current for clean bucketing
        const combined = [...prevResult.candles, ...completedCurrent];
        const combined_agg = aggregate(combined, interval, prevDate);

        const formingBucket =
          inBucket.length > 0
            ? {
                ...aggregate([...inBucket, { ...forming, t: forming.t }], interval, sessionDate)[0],
                t: bucketOpenMs,
              }
            : {
                t: bucketOpenMs,
                o: forming.o,
                h: forming.h,
                l: forming.l,
                c: forming.c,
                v: forming.v,
              };

        return res.json({
          candles: combined_agg.slice(-limit),
          forming: formingBucket,
          source,
        });
      }
    }

    // 1m: just return allCandles + forming
    const responseCandles = allCandles.slice(-limit);

    return res.json({
      candles: responseCandles,
      forming: forming || null,
      source,
    });
  }),
);

async function handleDailyCandles(res, symbol, sessionDate, virtualNowMs, limit) {
  const { candles: daily, source } = await getDaily(symbol, sessionDate, limit);

  // Forming daily bar from current session
  let forming = null;
  try {
    const { candles: session1m } = await getSession(symbol, sessionDate);
    const openMs = sessionOpenMs(sessionDate);
    const completedMinutes = Math.min(
      374,
      Math.max(0, Math.floor((virtualNowMs - openMs) / 60_000)),
    );
    const completedCandles = session1m.slice(0, completedMinutes + 1);
    forming = formingDailyBar(completedCandles, sessionDate);
  } catch {
    // Ignore — chart still works with historical daily data
  }

  return res.json({
    candles: daily.slice(-limit),
    forming,
    source,
  });
}
