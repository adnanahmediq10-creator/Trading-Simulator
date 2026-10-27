/**
 * POST   /api/orders           - place order (auth required, idempotency key)
 * GET    /api/orders           - list user's orders (auth)
 * DELETE /api/orders/:id       - cancel order (auth)
 * GET    /api/trades           - list user's trades (auth)
 */
import { Router } from 'express';
import { z } from 'zod';
import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { requireAuth } from '../middleware/auth.js';
import { orderLimiter } from '../middleware/rateLimits.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { placeOrder } from '../engine/placeOrder.js';
import { cancelOrder } from '../engine/cancelOrder.js';
import { matcher } from '../engine/matcher.js';
import { priceService } from '../market/priceService.js';
import { DomainError } from '../engine/errors.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

// ── POST /api/orders ──────────────────────────────────────────────────────────

ordersRouter.post(
  '/',
  orderLimiter,
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'];
    if (
      !idempotencyKey ||
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 64
    ) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Idempotency-Key header is required (8–64 chars)',
        { status: 400 },
      );
    }

    const io = req.app.get('io');
    const tick = priceService.getLatest(req.body?.symbol);
    const vts = tick?.vts;

    const { order, idempotent } = await placeOrder({
      userId: req.userId,
      input: req.body,
      idempotencyKey,
      priceService,
      vts,
      io,
    });

    // Register PENDING LIMIT with its current price as the crossing baseline.
    if (order.status === 'PENDING' && order.type === 'LIMIT') {
      const latest = priceService.getLatest(order.symbol);
      await matcher.registerOrder(order, latest?.pricePaise);
    }

    if (idempotent) {
      res.set('Idempotent-Replay', 'true');
    }

    res.status(idempotent ? 200 : 201).json({ order });
  }),
);

// ── GET /api/orders ───────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'FILLED', 'CANCELLED', 'REJECTED']).optional(),
  symbol: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 'Invalid query', { status: 400 });
    }
    const { status, symbol, limit, cursor } = parsed.data;

    const filter = { userId: req.userId };
    if (status) filter.status = status;
    if (symbol) filter.symbol = symbol;
    if (cursor) filter._id = { $lt: cursor };

    const orders = await Order.find(filter)
    .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = orders.length > limit;
    const results = orders.slice(0, limit);
    const nextCursor = hasMore ? String(results[results.length - 1]._id) : null;

    res.json({ orders: results, nextCursor, hasMore });
  }),
);

// ── DELETE /api/orders/:id ────────────────────────────────────────────────────

ordersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      throw new DomainError('VALIDATION_ERROR', 'Invalid order id', { status: 400 });
    }
    const io = req.app.get('io');
    const order = await cancelOrder({ userId: req.userId, orderId: req.params.id, io });
    matcher.removeOrder(req.params.id, order.symbol);
    res.json({ order });
  }),
);

// ── GET /api/trades ───────────────────────────────────────────────────────────
// Mounted separately at /api/trades via tradesRouter

const tradeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  symbol: z.string().optional(),
});

async function handleListTrades(req, res) {
  const parsed = tradeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid query', { status: 400 });
  }
  const { limit, cursor, symbol } = parsed.data;
  const filter = { userId: req.userId };
  if (symbol) filter.symbol = symbol;
  if (cursor) filter._id = { $lt: cursor };

  const trades = await Trade.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = trades.length > limit;
  const results = trades.slice(0, limit);
  const nextCursor = hasMore ? String(results[results.length - 1]._id) : null;

  res.json({ trades: results, nextCursor, hasMore });
}

// Keep /api/orders/trades for backward compat
ordersRouter.get('/trades', asyncHandler(handleListTrades));

// Separate router for /api/trades
export const tradesRouter = Router();
tradesRouter.use(requireAuth);
tradesRouter.get('/', asyncHandler(handleListTrades));

