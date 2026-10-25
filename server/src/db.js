import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

/** @returns {Promise<typeof mongoose>} */
export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  logger.info('MongoDB connected');
  return mongoose;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

/** @returns {'disconnected'|'connected'|'connecting'|'disconnecting'} */
export function dbStateLabel() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return /** @type {'disconnected'|'connected'|'connecting'|'disconnecting'} */ (
    states[mongoose.connection.readyState] ?? 'disconnected'
  );
}
