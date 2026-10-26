/**
 * POST /api/account/reset — reset a user's account to starting state.
 * Requires { confirm: true } in body.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { Position } from '../models/Position.js';
import { Trade } from '../models/Trade.js';
import { matcher } from '../engine/matcher.js';
import { DomainError } from '../engine/errors.js';

export const accountRouter = Router();
accountRouter.use(requireAuth);

const resetSchema = z.object({ confirm: z.literal(true) }).strict();

accountRouter.post(
  '/reset',
  asyncHandler(async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 'Send { "confirm": true } to reset', { status: 400 });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const userId = req.userId;

        const user = await User.findById(userId).select('startingCashPaise').session(session);
        if (!user) {
          throw new DomainError('UNAUTHENTICATED', 'User not found');
        }

        // Delete all user's data
        await Order.deleteMany({ userId }, { session });
        await Position.deleteMany({ userId }, { session });
        await Trade.deleteMany({ userId }, { session });

        // Restore cash to starting amount
        await User.updateOne(
          { _id: userId },
          { $set: { cashPaise: user.startingCashPaise, reservedCashPaise: 0 } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    // Rebuild matcher to remove any pending orders for this user
    await matcher.rebuild();

    res.json({ ok: true, message: 'Account reset to starting state' });
  }),
);
