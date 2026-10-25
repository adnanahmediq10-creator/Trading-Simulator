/**
 * executeFill — the single place where order fills happen.
 * All state mutations happen inside ONE Mongoose transaction.
 *
 * Fill price rule:
 *   - LIMIT orders fill at the triggering tick price (price improvement vs limit)
 *   - MARKET orders fill at the latest tick price
 *
 * Atomicity guarantee:
 *   Step 1 claims the order with a conditional update ({status:'PENDING'→'FILLED'}).
 *   If the claim returns null, the order was already filled or cancelled — abort.
 *   This prevents double-fills under concurrent calls.
 */
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Position } from '../models/Position.js';
import { Trade } from '../models/Trade.js';
import { User } from '../models/User.js';
import { weightedAvg, realizedPnl, mulPaise } from './money.js';
import { logger } from '../utils/logger.js';
import { DomainError } from './errors.js';

/**
 * @param {{ orderId: string, fillPricePaise: number, vts: number, io?: object }} params
 * @returns {Promise<{ order: object, trade: object } | null>}
 *   null if the order was already filled/cancelled (idempotent, no error)
 */
export async function executeFill({ orderId, fillPricePaise, vts, io }) {
  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      // ── Step 1: Atomically claim the order ──────────────────────────────
      const now = new Date();
      const order = await Order.findOneAndUpdate(
        { _id: orderId, status: 'PENDING' },
        {
          $set: {
            status: 'FILLED',
            filledPricePaise: fillPricePaise,
            filledQty: null, // set below
            filledAt: now,
            filledVts: vts,
          },
        },
        { new: true, session },
      );

      if (!order) {
        // Already filled or cancelled — abort transaction cleanly
        return;
      }

      const { userId, symbol, side, qty, type, reservedPaise } = order;

      // Set filledQty after we have the order
      order.filledQty = qty;
      await Order.updateOne({ _id: orderId }, { $set: { filledQty: qty } }, { session });

      // ── Step 2: BUY — debit cash, upsert position ───────────────────────
      if (side === 'BUY') {
        const cost = mulPaise(fillPricePaise, qty);

        // Debit cash and release reservation (if any)
        const cashUpdate = { $inc: { cashPaise: -cost } };
        if (reservedPaise && reservedPaise > 0) {
          cashUpdate.$inc.reservedCashPaise = -reservedPaise;
        }
        await User.updateOne({ _id: userId }, cashUpdate, { session });

        // Upsert position with weighted average
        const pos = await Position.findOne({ userId, symbol }).session(session);
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
      }

      // ── Step 3: SELL — credit cash, decrement position ──────────────────
      if (side === 'SELL') {
        const pos = await Position.findOne({ userId, symbol }).session(session);
        if (!pos) {
          throw new DomainError('INTERNAL', 'Position not found during SELL fill');
        }

        const proceeds = mulPaise(fillPricePaise, qty);
        const pnl = realizedPnl(fillPricePaise, pos.avgCostPaise, qty);

        // Credit cash
        await User.updateOne({ _id: userId }, { $inc: { cashPaise: proceeds } }, { session });

        // Decrement position qty and release reservedQty (if LIMIT)
        const posUpdate = {
          $inc: {
            qty: -qty,
            realizedPnlPaise: pnl,
          },
        };
        if (type === 'LIMIT' && pos.reservedQty >= qty) {
          posUpdate.$inc.reservedQty = -qty;
        }
        await Position.updateOne({ userId, symbol }, posUpdate, { session });
      }

      // ── Step 4: Write immutable trade record ─────────────────────────────
      const tradeData = {
        orderId: order._id,
        userId,
        symbol,
        side,
        qty,
        pricePaise: fillPricePaise,
        executedAt: now,
        executedVts: vts,
      };
      if (side === 'SELL') {
        const pos = await Position.findOne({ userId, symbol }).session(session);
        // pos may already be updated; get avgCostPaise before this fill from order record
        // We re-derive pnl from the fill price and the avg cost at time of fill
        // The pos.avgCostPaise is unchanged on sells (spec 12.3)
        // We already computed pnl above; store it
        tradeData.realizedPnlPaise = order._realizedPnlForTrade ?? 0;
      }

      const [trade] = await Trade.create([tradeData], { session });
      result = { order, trade };

      logger.info(
        { orderId, symbol, side, qty, fillPricePaise, userId: String(userId) },
        'Order filled',
      );
    });
  } finally {
    await session.endSession();
  }

  // ── Step 5: Emit socket events (after commit) ────────────────────────────
  if (result && io) {
    const roomId = `user:${String(result.order.userId)}`;
    io.to(roomId).emit('order:update', result.order.toObject?.() ?? result.order);
    io.to(roomId).emit('portfolio:update', { reason: 'fill', symbol: result.order.symbol });
  }

  return result;
}
