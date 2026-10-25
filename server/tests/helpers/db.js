/**
 * Shared test helpers: MongoMemoryReplSet setup and stub price service.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

/** @type {MongoMemoryReplSet} */
export let replSet;

export async function startReplSet() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  // Ensure indexes
  const { User } = await import('../../src/models/User.js');
  const { Order } = await import('../../src/models/Order.js');
  const { Position } = await import('../../src/models/Position.js');
  const { Trade } = await import('../../src/models/Trade.js');
  await Promise.all([
    User.createIndexes(),
    Order.createIndexes(),
    Position.createIndexes(),
    Trade.createIndexes(),
  ]);
}

export async function stopReplSet() {
  await mongoose.disconnect();
  await replSet.stop();
}

export async function clearCollections() {
  const { User } = await import('../../src/models/User.js');
  const { Order } = await import('../../src/models/Order.js');
  const { Position } = await import('../../src/models/Position.js');
  const { Trade } = await import('../../src/models/Trade.js');
  await Promise.all([
    User.deleteMany({}),
    Order.deleteMany({}),
    Position.deleteMany({}),
    Trade.deleteMany({}),
  ]);
}

/**
 * Create a stub price service.
 * @param {string} symbol
 * @param {number} pricePaise
 */
export function makePriceService(pricesBySymbol = {}) {
  return {
    getLatest(symbol) {
      const price = pricesBySymbol[symbol];
      if (price == null) return null;
      return { pricePaise: price, vts: Date.now(), prevClosePaise: price };
    },
    isStale(symbol) {
      return pricesBySymbol[symbol] == null;
    },
    setPrice(symbol, paise) {
      pricesBySymbol[symbol] = paise;
    },
  };
}

/**
 * Create a test user with starting cash.
 */
export async function createUser(overrides = {}) {
  const { User } = await import('../../src/models/User.js');
  const { env } = await import('../../src/config/env.js');
  return User.create({
    email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    name: 'Test User',
    passwordHash: 'ignored',
    cashPaise: env.STARTING_CASH_PAISE,
    startingCashPaise: env.STARTING_CASH_PAISE,
    reservedCashPaise: 0,
    ...overrides,
  });
}
