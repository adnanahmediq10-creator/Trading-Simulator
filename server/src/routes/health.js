import { Router } from 'express';
import { dbStateLabel } from '../db.js';

const startTime = Date.now();

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const dbState = dbStateLabel();
  const degraded = dbState !== 'connected';

  res.status(degraded ? 503 : 200).json({
    status: degraded ? 'degraded' : 'ok',
    uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    time: new Date().toISOString(),
    db: { state: dbState },
    ticker: { running: false, lastTickAgeMs: null },
    ingest: {
      enabled: false,
      breaker: {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastSuccessAt: null,
        nextRetryAt: null,
      },
    },
    dataSources: {},
    matcher: { pendingOrders: 0 },
  });
});
