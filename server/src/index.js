import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { loadSnapshots } from './market/candleStore.js';
import { priceService } from './market/priceService.js';

let server;
/** @type {import('http').Server} */
let httpServer;

async function boot() {
  // 1. Connect to MongoDB
  await connectDb();

  // 2. Load committed snapshots into memory
  await loadSnapshots();

  // 3. Create Express app
  const app = createApp();

  // 4. Start HTTP server
  httpServer = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'HTTP server listening');
  });
  server = httpServer;

  // 5. Start price service ticker (1 Hz)
  priceService.start();

  logger.info('Boot complete');
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  try {
    // Stop the price service
    priceService.stop();

    // Close HTTP server
    await new Promise((resolve, reject) => {
      if (server) {
        server.close((err) => (err ? reject(err) : resolve()));
      } else {
        resolve();
      }
    });

    // Disconnect from DB
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
