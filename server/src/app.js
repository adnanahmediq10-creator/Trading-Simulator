import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthRouter } from './routes/health.js';
import { marketRouter } from './routes/market.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../../client/dist');

/**
 * @param {{ skipDb?: boolean }} [_opts]
 * @returns {import('express').Express}
 */
export function createApp(_opts = {}) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    }),
  );

  // CORS for dev only
  if (env.NODE_ENV === 'development') {
    app.use(
      cors({
        origin: env.CLIENT_ORIGIN,
        credentials: true,
      }),
    );
  }

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers['x-request-id'] ?? crypto.randomUUID(),
    }),
  );

  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  // API routes
  app.use('/api/health', healthRouter);
  app.use('/api/market', marketRouter);

  if (env.NODE_ENV === 'production') {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
