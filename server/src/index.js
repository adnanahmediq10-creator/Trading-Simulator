import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { loadSnapshots } from './market/candleStore.js';
import { priceService } from './market/priceService.js';
import { matcher } from './engine/matcher.js';
import { startIngest, stopIngest } from './market/ingest.js';

let server;

async function boot() {
  // 1. Connect to MongoDB
  await connectDb();

  // 2. Load committed snapshots into memory (weekend/offline safety net)
  await loadSnapshots();

  // 3. Rebuild matcher index from DB (restart safety)
  await matcher.rebuild();

  // 4. Create Express app
  const app = createApp();

  // 5. Start HTTP server
  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'HTTP server listening');
  });

  // 6. Wire Socket.IO (done in sockets/index.js)
  const { initSocketIO } = await import('./sockets/index.js');
  const io = initSocketIO(server);
  app.set('io', io);
  matcher.setIo(io);

  // 7. Start price service ticker (1 Hz)
  priceService.start();

  // 8. Start ingest job
  startIngest();

  // 9. Matcher subscribes to price service
  matcher.subscribe(priceService);

  logger.info('Boot complete');
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  try {
    priceService.stop();
    stopIngest();

    await new Promise((resolve, reject) => {
      if (server) {
        server.close((err) => (err ? reject(err) : resolve()));
      } else {
        resolve();
      }
    });

    await disconnectDb();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Shutdown error');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

boot().catch((err) => {
  logger.fatal({ err }, 'Boot failed');
  process.exit(1);
});
