import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

let server;

async function boot() {
  await connectDb();
  const app = createApp();
  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'HTTP server listening');
  });
}

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  const done = async () => {
    try {
      await disconnectDb();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Shutdown error');
      process.exit(1);
    }
  };

  if (server) {
    server.close(() => {
      done();
    });
  } else {
    done();
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
