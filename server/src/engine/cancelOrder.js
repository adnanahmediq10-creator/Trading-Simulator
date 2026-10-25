/**
 * cancelOrder — atomically cancel a PENDING order and release its reservation.
 */
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Position } from '../models/Position.js';
import { User } from '../models/User.js';
import { DomainError } from './errors.js';
import { logger } from '../utils/logger.js';

/**
 * @param {{ userId: string, orderId: string, io?: object }} params
 * @returns {Promise<object>} the cancelled order
 */
export async function cancelOrder({ userId, orderId, io }) {
  const session = await mongoose.startSession();
  let cancelled;

  try {
    await session.withTransaction(async () => {
      // Atomically mark as cancelled — only if PENDING and owned by this user
      const order = await Order.findOneAndUpdate(
        { _id: orderId, userId, status: 'PENDING' },
        { $set: { status: 'CANCELLED', cancelledAt: new Date() } },
        { new: true, session },
      );

      if (!order) {
        // Could be: not found, wrong user, or not pending
        const lookup = await Order.findById(orderId).session(session);
        if (!lookup || String(lookup.userId) !== String(userId)) {
          throw new DomainError('ORDER_NOT_FOUND', 'Order not found');
        }
        throw new DomainError('ORDER_NOT_CANCELLABLE', `Order is ${lookup.status} and cannot be cancelled`);
      }

      // Release reservation
      if (order.side === 'BUY' && order.reservedPaise > 0) {
        await User.updateOne(
          { _id: userId },
          { $inc: { reservedCashPaise: -order.reservedPaise } },
          { session },
        );
      } else if (order.side === 'SELL' && order.qty > 0) {
        await Position.updateOne(
          { userId, symbol: order.symbol },
          { $inc: { reservedQty: -order.qty } },
          { session },
        );
      }

      cancelled = order;
    });
  } finally {
    await session.endSession();
  }

  logger.info({ orderId, userId }, 'Order cancelled');

  if (io && cancelled) {
    io.to(`user:${userId}`).emit('order:update', cancelled.toObject());
    io.to(`user:${userId}`).emit('portfolio:update', { reason: 'cancel', symbol: cancelled.symbol });
  }

  return cancelled;
}
