/**
 * placeOrder — validates and places a new order.
 *
 * Flow:
 *  1. Zod validation
 *  2. Idempotency check
 *  3. Instrument & price checks
 *  4. MARKET: atomic conditional debit + immediate fill
 *  5. LIMIT:  atomic conditional reserve + insert PENDING
 *  6. Register PENDING limits with current quote as their crossing baseline
 */
import mongoose from 'mongoose';
import { z } from 'zod';
import { Order } from '../models/Order.js';
import { Position } from '../models/Position.js';
import { User } from '../models/User.js';
import { getInstrument } from '../config/instruments.js';
import { DomainError } from './errors.js';
import { mulPaise, isValidPrice } from './money.js';
import { logger } from '../utils/logger.js';

const orderSchema = z
  .object({
    symbol: z.string().min(1),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT']),
    qty: z.number().int().min(1).max(10_000),
    limitPricePaise: z.number().int().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'MARKET' && data.limitPricePaise != null) {
      ctx.addIssue({ code: 'custom', message: 'MARKET orders must not include a limit price' });
    }
    if (data.type === 'LIMIT') {
      if (data.limitPricePaise == null) {
        ctx.addIssue({ code: 'custom', message: 'LIMIT orders require limitPricePaise' });
      } else if (!isValidPrice(data.limitPricePaise)) {
        ctx.addIssue({ code: 'custom', message: 'limitPricePaise must be a positive multiple of 5' });
      }
    }
  });

/**
 * @param {{
 *   userId: string,
 *   input: object,
 *   idempotencyKey: string,
 *   priceService: import('../market/priceService.js').PriceService,
 *   vts?: number,
 *   io?: object,
 * }} params
 * @returns {Promise<{ order: object, idempotent?: boolean }>}
 */
export async function placeOrder({ userId, input, idempotencyKey, priceService, vts, io }) {
  // ── 1. Validate ─────────────────────────────────────────────────────────────
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid order input', {
      details: parsed.error.flatten(),
      status: 400,
    });
  }
  const { symbol, side, type, qty, limitPricePaise } = parsed.data;

  // ── 2. Idempotency ──────────────────────────────────────────────────────────
  {
    const existing = await Order.findOne({ userId, idempotencyKey });
    if (existing) {
      logger.info({ orderId: existing._id, idempotencyKey }, 'Idempotent replay');
      return { order: existing, idempotent: true };
    }
  }

  // ── 3. Instrument checks ────────────────────────────────────────────────────
  const inst = getInstrument(symbol);
  if (!inst) throw new DomainError('INSTRUMENT_NOT_FOUND', `Unknown symbol: ${symbol}`);
  if (!inst.tradable) throw new DomainError('INSTRUMENT_NOT_TRADABLE', `${symbol} is not tradable`);

  // ── 4. Price availability ───────────────────────────────────────────────────
  if (!priceService) throw new DomainError('INTERNAL', 'Price service not available');
  const tick = priceService.getLatest(symbol);
  if (!tick || priceService.isStale(symbol)) {
    throw new DomainError('PRICE_UNAVAILABLE', `No live price for ${symbol}`);
  }
  const currentPrice = tick.pricePaise;
  const virtualNow = vts ?? tick.vts ?? Date.now();

  // ── 5. LIMIT price band check (±20%) ───────────────────────────────────────
  if (type === 'LIMIT') {
    const band = Math.round(currentPrice * 0.2);
    if (limitPricePaise < currentPrice - band || limitPricePaise > currentPrice + band) {
      throw new DomainError(
        'PRICE_OUT_OF_BAND',
        `Limit price must be within 20% of current price (${currentPrice} paise)`,
      );
    }
  }

  // ── 6. Place the order ──────────────────────────────────────────────────────
  let order;

  if (type === 'MARKET') {
    order = await placeMarketOrder({
      userId, symbol, side, qty,
      currentPrice, virtualNow, idempotencyKey,
      priceService, io,
    });
  } else {
    order = await placeLimitOrder({
      userId, symbol, side, qty, limitPricePaise,
      currentPrice, virtualNow, idempotencyKey,
      io,
    });
  }

  return { order };
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKET order
// ─────────────────────────────────────────────────────────────────────────────

async function placeMarketOrder({ userId, symbol, side, qty, currentPrice, virtualNow, idempotencyKey, io }) {
  const cost = mulPaise(currentPrice, qty);
  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      if (side === 'BUY') {
        // Conditional debit: cash - reserved >= cost
        const userResult = await User.findOneAndUpdate(
          {
            _id: userId,
            $expr: { $gte: [{ $subtract: ['$cashPaise', '$reservedCashPaise'] }, cost] },
          },
          { $inc: { cashPaise: -cost } },
          { new: true, session },
        );
        if (!userResult) {
          throw new DomainError('INSUFFICIENT_FUNDS', 'Not enough buying power');
        }
      } else {
        // SELL: conditional decrement from position
        const pos = await Position.findOneAndUpdate(
          {
            userId,
            symbol,
            $expr: { $gte: [{ $subtract: ['$qty', '$reservedQty'] }, qty] },
          },
          {}, // No update here; fill will do the actual decrement
          { session },
        );
        if (!pos) {
          throw new DomainError('INSUFFICIENT_SHARES', 'Not enough shares to sell');
        }
      }

      // Insert order as FILLED (market orders fill immediately)
      const now = new Date();
      const [created] = await Order.create(
        [
          {
            userId,
            symbol,
            side,
            type: 'MARKET',
            qty,
            status: 'FILLED',
            filledPricePaise: currentPrice,
            filledQty: qty,
            filledAt: now,
            filledVts: virtualNow,
            createdVts: virtualNow,
            idempotencyKey,
          },
        ],
        { session },
      );
      order = created;

      // Directly apply fill within same transaction
      await applyFillInSession({ order, fillPricePaise: currentPrice, session, virtualNow });
    });
  } catch (err) {
    await session.endSession();
    // Idempotency: if duplicate key, return existing order
    if (err.code === 11000) {
      const existing = await Order.findOne({ userId, idempotencyKey });
      if (existing) return { order: existing, idempotent: true };
    }
    throw err;
  }

  await session.endSession();

  // Emit socket events after commit
  if (io) {
    const roomId = `user:${userId}`;
    io.to(roomId).emit('order:update', order.toObject());
    io.to(roomId).emit('portfolio:update', { reason: 'fill', symbol });
  }

  logger.info({ orderId: order._id, symbol, side, qty, currentPrice }, 'Market order filled');
  return order;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply fill inside an already-open session (for MARKET orders)
// ─────────────────────────────────────────────────────────────────────────────

async function applyFillInSession({ order, fillPricePaise, session, virtualNow }) {
  const { userId, symbol, side, qty } = order;

  if (side === 'BUY') {
    // Cash was already debited in the market order block
    // Just upsert the position
    const pos = await Position.findOne({ userId, symbol }).session(session);
    const { weightedAvg } = await import('./money.js');
    if (pos) {
      const newAvg = weightedAvg(pos.qty, pos.avgCostPaise, qty, fillPricePaise);
      await Position.updateOne(
        { userId, symbol },
        { $inc: { qty }, $set: { avgCostPaise: newAvg } },
        { session },
      );
    } else {
      await Position.create(
        [{ userId, symbol, qty, avgCostPaise: fillPricePaise, reservedQty: 0, realizedPnlPaise: 0 }],
        { session },
      );
    }
  } else {
    // SELL: credit cash, decrement position
    const pos = await Position.findOne({ userId, symbol }).session(session);
    if (!pos) throw new DomainError('INTERNAL', 'Position not found during SELL fill');

    const { realizedPnl, mulPaise } = await import('./money.js');
    const proceeds = mulPaise(fillPricePaise, qty);
    const pnl = realizedPnl(fillPricePaise, pos.avgCostPaise, qty);

    await User.updateOne({ _id: userId }, { $inc: { cashPaise: proceeds } }, { session });
    await Position.updateOne(
      { userId, symbol },
      { $inc: { qty: -qty, realizedPnlPaise: pnl } },
      { session },
    );

    const { Trade } = await import('../models/Trade.js');
    await Trade.create(
      [
        {
          orderId: order._id,
          userId,
          symbol,
          side,
          qty,
          pricePaise: fillPricePaise,
          realizedPnlPaise: pnl,
          executedAt: new Date(),
          executedVts: virtualNow,
        },
      ],
      { session },
    );
    return;
  }

  // Write BUY trade
  const { Trade } = await import('../models/Trade.js');
  await Trade.create(
    [
      {
        orderId: order._id,
        userId,
        symbol,
        side,
        qty,
        pricePaise: fillPricePaise,
        realizedPnlPaise: 0,
        executedAt: new Date(),
        executedVts: virtualNow,
      },
    ],
    { session },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIMIT order
// ─────────────────────────────────────────────────────────────────────────────

async function placeLimitOrder({ userId, symbol, side, qty, limitPricePaise, virtualNow, idempotencyKey, io }) {
  const reservedPaise = mulPaise(limitPricePaise, qty);
  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      if (side === 'BUY') {
        // Reserve funds: cashPaise - reservedCashPaise >= reservedPaise
        const userResult = await User.findOneAndUpdate(
          {
            _id: userId,
            $expr: { $gte: [{ $subtract: ['$cashPaise', '$reservedCashPaise'] }, reservedPaise] },
          },
          { $inc: { reservedCashPaise: reservedPaise } },
          { new: true, session },
        );
        if (!userResult) {
          throw new DomainError('INSUFFICIENT_FUNDS', 'Not enough buying power to reserve');
        }
      } else {
        // Reserve shares: qty - reservedQty >= qty
        const pos = await Position.findOneAndUpdate(
          {
            userId,
            symbol,
            $expr: { $gte: [{ $subtract: ['$qty', '$reservedQty'] }, qty] },
          },
          { $inc: { reservedQty: qty } },
          { new: true, session },
        );
        if (!pos) {
          throw new DomainError('INSUFFICIENT_SHARES', 'Not enough available shares to sell');
        }
      }

      // Insert PENDING order
      const [created] = await Order.create(
        [
          {
            userId,
            symbol,
            side,
            type: 'LIMIT',
            qty,
            limitPricePaise,
            status: 'PENDING',
            reservedPaise,
            createdVts: virtualNow,
            idempotencyKey,
          },
        ],
        { session },
      );
      order = created;
    });
  } catch (err) {
    await session.endSession();
    if (err.code === 11000) {
      const existing = await Order.findOne({ userId, idempotencyKey });
      if (existing) return { order: existing, idempotent: true };
    }
    throw err;
  }

  await session.endSession();

  logger.info({ orderId: order._id, symbol, side, qty, limitPricePaise }, 'Limit order placed (PENDING)');

  // Emit to user room
  if (io) {
    io.to(`user:${userId}`).emit('order:update', order.toObject());
  }

  return order;
}
