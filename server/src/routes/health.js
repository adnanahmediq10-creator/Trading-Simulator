import { Router } from 'express';
import { dbStateLabel } from '../db.js';
import { priceService } from '../market/priceService.js';
import { matcher } from '../engine/matcher.js';
import {
  getEffectiveMode,
  getVirtualTime,
  getHolidays,
} from '../market/clock.js';
import { env } from '../config/env.js';

const startTime = Date.now();

export const healthRouter = Router();

/**
 * @type {{ state: string, consecutiveFailures: number, lastSuccessAt: string|null, nextRetryAt: string|null }}
 */
let breakerState = {
  state: 'CLOSED',
  consecutiveFailures: 0,
  lastSuccessAt: null,
  nextRetryAt: null,
};

/** Called by ingest.js to update breaker state for the health endpoint */
export function setBreakerState(state) {
  breakerState = { ...breakerState, ...state };
}

healthRouter.get('/', (_req, res) => {
  const dbState = dbStateLabel();
  const dbDown = dbState === 'disconnected';

  const nowMs = Date.now();
  const holidays = getHolidays();
  const modeInfo = getEffectiveMode(nowMs, holidays, true);
  const { virtualNowMs, sessionEpoch } = getVirtualTime(nowMs, modeInfo, env.REPLAY_SPEED);

  const tickerStatus = priceService.getStatus();
  const dataSources = priceService.getDataSources();

  // Degraded if DB is down or if any symbol is running on synthetic data
  const syntheticCount = Object.values(dataSources).filter((s) => s === 'synthetic').length;
  const degraded = dbDown || syntheticCount > 0;

  res.status(dbDown ? 503 : 200).json({
    status: degraded ? 'degraded' : 'ok',
    uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    time: new Date().toISOString(),
    mode: modeInfo.mode,
    effectiveMode: modeInfo.effectiveMode ?? modeInfo.mode,
    virtualNowMs,
    sessionEpoch,
    db: { state: dbState },
    ticker: {
      running: tickerStatus.running,
      lastTickAgeMs: tickerStatus.lastTickAgeMs,
    },
    ingest: {
      enabled: env.INGEST_ENABLED,
      breaker: breakerState,
    },
    dataSources,
    matcher: { pendingOrders: matcher.size() },
  });
});
