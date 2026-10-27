/**
 * Engine integration tests — the core of the grade.
 * All tests run against a MongoMemoryReplSet so transactions work.
 *
 * Tests cover spec section 18 engine requirements.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startReplSet, stopReplSet, clearCollections, createUser, makePriceService } from '../helpers/db.js';
import { placeOrder } from '../../src/engine/placeOrder.js';
import { cancelOrder } from '../../src/engine/cancelOrder.js';
import { executeFill } from '../../src/engine/executeFill.js';
import { matcher } from '../../src/engine/matcher.js';
import { Trade as TradeModel } from '../../src/models/Trade.js';
import { Order } from '../../src/models/Order.js';
import { Position } from '../../src/models/Position.js';
import { Trade } from '../../src/models/Trade.js';
import { User } from '../../src/models/User.js';
import { env } from '../../src/config/env.js';

const SYMBOL = 'RELIANCE';
const PRICE = 150_000; // 1500.00 INR in paise
const QTY = 10;

describe('Order Engine Integration Tests', () => {
  beforeAll(async () => {
    await startReplSet();
  }, 120_000);

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  // ── Helper ─────────────────────────────────────────────────────────────────

  function ps(price = PRICE) {
    return makePriceService({ [SYMBOL]: price });
  }

  async function buyMarket(user, qty = QTY, price = PRICE) {
    return placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty },
      idempotencyKey: `test-buy-${Date.now()}-${Math.random()}`,
      priceService: ps(price),
      vts: Date.now(),
    });
  }

  async function sellMarket(user, qty = QTY, price = PRICE) {
    return placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'SELL', type: 'MARKET', qty },
      idempotencyKey: `test-sell-${Date.now()}-${Math.random()}`,
      priceService: ps(price),
      vts: Date.now(),
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MARKET BUY
  // ──────────────────────────────────────────────────────────────────────────

  it('MARKET BUY: cash decreases, position created, trade written, order FILLED', async () => {
    const user = await createUser();
    const startCash = user.cashPaise;
    const cost = PRICE * QTY;

    const { order } = await buyMarket(user);

    expect(order.status).toBe('FILLED');
    expect(order.filledPricePaise).toBe(PRICE);
    expect(order.filledQty).toBe(QTY);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.cashPaise).toBe(startCash - cost);

    const pos = await Position.findOne({ userId: user._id, symbol: SYMBOL });
    expect(pos).toBeTruthy();
    expect(pos.qty).toBe(QTY);
    expect(pos.avgCostPaise).toBe(PRICE);

    const trade = await Trade.findOne({ userId: user._id });
    expect(trade).toBeTruthy();
    expect(trade.pricePaise).toBe(PRICE);
    expect(trade.qty).toBe(QTY);
    expect(trade.side).toBe('BUY');
  });

  it('MARKET BUY (second): weighted average cost correct', async () => {
    const user = await createUser();
    const price1 = 150_000;
    const price2 = 160_000;
    const qty1 = 10;
    const qty2 = 5;

    await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty: qty1 },
      idempotencyKey: `ik1-${Date.now()}`,
      priceService: ps(price1),
      vts: Date.now(),
    });

    await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty: qty2 },
      idempotencyKey: `ik2-${Date.now()}`,
      priceService: ps(price2),
      vts: Date.now(),
    });

    const pos = await Position.findOne({ userId: user._id, symbol: SYMBOL });
    expect(pos.qty).toBe(qty1 + qty2);
    const expectedAvg = Math.round((qty1 * price1 + qty2 * price2) / (qty1 + qty2));
    expect(pos.avgCostPaise).toBe(expectedAvg);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MARKET SELL
  // ──────────────────────────────────────────────────────────────────────────

  it('MARKET SELL: realized P&L correct, cash credited, qty hits 0, position retained', async () => {
    const buyPrice = 150_000;
    const sellPrice = 160_000;
    const user = await createUser();

    await buyMarket(user, QTY, buyPrice);
    await sellMarket(user, QTY, sellPrice);

    const pos = await Position.findOne({ userId: user._id, symbol: SYMBOL });
    expect(pos.qty).toBe(0); // position qty zero, row kept
    expect(pos).toBeTruthy();

    const expectedPnl = (sellPrice - buyPrice) * QTY;
    expect(pos.realizedPnlPaise).toBe(expectedPnl);

    const updatedUser = await User.findById(user._id);
    // Started with env.STARTING_CASH_PAISE
    // After buy: -buyPrice*QTY
    // After sell: +sellPrice*QTY
    const expectedCash = env.STARTING_CASH_PAISE - buyPrice * QTY + sellPrice * QTY;
    expect(updatedUser.cashPaise).toBe(expectedCash);

    const trades = await Trade.find({ userId: user._id }).sort({ executedAt: 1 });
    expect(trades).toHaveLength(2);
    expect(trades[1].side).toBe('SELL');
    expect(trades[1].realizedPnlPaise).toBe(expectedPnl);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Insufficient funds / shares
  // ──────────────────────────────────────────────────────────────────────────

  it('MARKET BUY: INSUFFICIENT_FUNDS when cost exceeds available cash', async () => {
    const user = await createUser({ cashPaise: 1000 }); // 10 INR only
    await expect(buyMarket(user, 100, 150_000)).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
  });

  it('MARKET SELL: INSUFFICIENT_SHARES when no position', async () => {
    const user = await createUser();
    await expect(sellMarket(user, 1)).rejects.toMatchObject({
      code: 'INSUFFICIENT_SHARES',
    });
  });

  it('No shorting: cannot sell more shares than held', async () => {
    const user = await createUser();
    await buyMarket(user, 5);
    await expect(sellMarket(user, 10)).rejects.toMatchObject({ code: 'INSUFFICIENT_SHARES' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LIMIT orders
  // ──────────────────────────────────────────────────────────────────────────

  it('BUY LIMIT: reserves funds atomically, order PENDING', async () => {
    const user = await createUser();
    const limitPrice = 148_000; // within 20% band of 150k
    const reserveExpected = limitPrice * QTY;

    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: QTY, limitPricePaise: limitPrice },
      idempotencyKey: `lmt-buy-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    expect(order.status).toBe('PENDING');
    expect(order.reservedPaise).toBe(reserveExpected);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.reservedCashPaise).toBe(reserveExpected);
  });

  it('BUY LIMIT fills when tick price <= limit price', async () => {
    const user = await createUser();
    const limitPrice = 150_000;

    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: QTY, limitPricePaise: limitPrice },
      idempotencyKey: `lmt-fill-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    // Trigger fill at tick price <= limit
    const tickPrice = 148_000;
    await executeFill({ orderId: order._id, fillPricePaise: tickPrice, vts: Date.now() });

    const filled = await Order.findById(order._id);
    expect(filled.status).toBe('FILLED');
    expect(filled.filledPricePaise).toBe(tickPrice);

    // Cash: debited tickPrice * qty (not limitPrice * qty)
    // reservedPaise = limitPrice * qty was released
    const updatedUser = await User.findById(user._id);
    const cost = tickPrice * QTY;
    const expected = env.STARTING_CASH_PAISE - cost;
    expect(updatedUser.cashPaise).toBe(expected);
    expect(updatedUser.reservedCashPaise).toBe(0);

    const pos = await Position.findOne({ userId: user._id, symbol: SYMBOL });
    expect(pos.qty).toBe(QTY);
  });

  it('SELL LIMIT: reserves shares, fills when tick >= limit', async () => {
    const user = await createUser();
    // First buy shares
    await buyMarket(user, QTY);

    const limitPrice = 160_000;
    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', qty: QTY, limitPricePaise: limitPrice },
      idempotencyKey: `sell-lmt-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    expect(order.status).toBe('PENDING');
    const pos = await Position.findOne({ userId: user._id, symbol: SYMBOL });
    expect(pos.reservedQty).toBe(QTY);

    // Fill at tick price >= limit
    const tickPrice = 162_000;
    await executeFill({ orderId: order._id, fillPricePaise: tickPrice, vts: Date.now() });

    const filled = await Order.findById(order._id);
    expect(filled.status).toBe('FILLED');

    const posAfter = await Position.findOne({ userId: user._id, symbol: SYMBOL });
    expect(posAfter.qty).toBe(0);
    expect(posAfter.reservedQty).toBe(0);
  });

  it('Reserved funds: two BUY limits exceeding buying power, second is rejected', async () => {
    const limitPrice = 148_000; // within 20% of 150_000
    const qty = 2;
    // Give user exactly enough for 2 shares at 148k
    const user = await createUser({ cashPaise: limitPrice * qty }); // 296000 paise

    // First order: uses all buying power
    await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty, limitPricePaise: limitPrice },
      idempotencyKey: `lmt-1-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    // Second order: no buying power left
    await expect(
      placeOrder({
        userId: String(user._id),
        input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: 1, limitPricePaise: limitPrice },
        idempotencyKey: `lmt-2-${Date.now()}`,
        priceService: ps(PRICE),
        vts: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('Reserved shares: SELL limit + market SELL exceed holdings', async () => {
    const user = await createUser();
    await buyMarket(user, 5);

    const limitPrice = 160_000;
    // Reserve all 5 shares for SELL limit
    await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'SELL', type: 'LIMIT', qty: 5, limitPricePaise: limitPrice },
      idempotencyKey: `sell-lmt-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    // Try to sell 1 more (all 5 are reserved)
    await expect(sellMarket(user, 1)).rejects.toMatchObject({ code: 'INSUFFICIENT_SHARES' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Double-fill prevention
  // ──────────────────────────────────────────────────────────────────────────

  it('Double-fill prevention: concurrent executeFill calls fill exactly once', async () => {
    const user = await createUser();
    const limitPrice = 150_000;

    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: QTY, limitPricePaise: limitPrice },
      idempotencyKey: `dbl-fill-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    // Call executeFill twice concurrently; exactly one should succeed (return non-null)
    const results = await Promise.allSettled([
      executeFill({ orderId: order._id, fillPricePaise: PRICE, vts: Date.now() }),
      executeFill({ orderId: order._id, fillPricePaise: PRICE, vts: Date.now() }),
    ]);
    const successes = results.filter((r) => r.status === 'fulfilled' && r.value !== null);
    expect(successes).toHaveLength(1);

    // Exactly one trade
    const trades = await Trade.find({ orderId: order._id });
    expect(trades).toHaveLength(1);

    // Cash debited exactly once
    const finalUser = await User.findById(user._id);
    const cost = PRICE * QTY;
    // Cash was env.STARTING_CASH_PAISE - cost
    expect(finalUser.cashPaise).toBe(env.STARTING_CASH_PAISE - cost);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cancel vs fill race
  // ──────────────────────────────────────────────────────────────────────────

  it('Cancel vs fill race: exactly one winner, balances consistent', async () => {
    const user = await createUser();
    const limitPrice = 150_000;

    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: QTY, limitPricePaise: limitPrice },
      idempotencyKey: `race-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    await Promise.allSettled([
      executeFill({ orderId: order._id, fillPricePaise: PRICE, vts: Date.now() }),
      cancelOrder({ userId: String(user._id), orderId: String(order._id) }),
    ]);

    const finalOrder = await Order.findById(order._id);
    // Order must be in exactly one terminal state
    expect(['FILLED', 'CANCELLED']).toContain(finalOrder.status);

    // Reservation must be fully released regardless of winner
    const finalUser = await User.findById(user._id);
    expect(finalUser.reservedCashPaise).toBe(0);

    // If cancelled: cash unchanged from start; if filled: cash decreased by cost
    if (finalOrder.status === 'CANCELLED') {
      expect(finalUser.cashPaise).toBe(env.STARTING_CASH_PAISE);
    } else {
      expect(finalUser.cashPaise).toBe(env.STARTING_CASH_PAISE - PRICE * QTY);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Idempotency
  // ──────────────────────────────────────────────────────────────────────────

  it('Idempotency: same key returns same order without re-processing', async () => {
    const user = await createUser();
    const key = `idem-${Date.now()}`;

    const { order: o1, idempotent: r1 } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty: QTY },
      idempotencyKey: key,
      priceService: ps(PRICE),
      vts: Date.now(),
    });
    expect(r1).toBeUndefined(); // first call not idempotent

    const { order: o2, idempotent: r2 } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty: QTY },
      idempotencyKey: key,
      priceService: ps(PRICE),
      vts: Date.now(),
    });
    expect(r2).toBe(true);
    expect(String(o1._id)).toBe(String(o2._id));

    // Only one order, one trade
    const orders = await Order.find({ userId: user._id });
    expect(orders).toHaveLength(1);
    const trades = await Trade.find({ userId: user._id });
    expect(trades).toHaveLength(1);
  });

  it('Concurrent idempotent requests: only one order created', async () => {
    const user = await createUser();
    const key = `concurrent-idem-${Date.now()}`;

    const results = await Promise.allSettled([
      placeOrder({
        userId: String(user._id),
        input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty: 1 },
        idempotencyKey: key,
        priceService: ps(PRICE),
        vts: Date.now(),
      }),
      placeOrder({
        userId: String(user._id),
        input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty: 1 },
        idempotencyKey: key,
        priceService: ps(PRICE),
        vts: Date.now(),
      }),
    ]);

    // Both should succeed (one idempotent replay)
    const successes = results.filter((r) => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const orders = await Order.find({ userId: user._id });
    expect(orders).toHaveLength(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Stale price
  // ──────────────────────────────────────────────────────────────────────────

  it('Stale price: MARKET order rejected with PRICE_UNAVAILABLE', async () => {
    const user = await createUser();
    const stalePriceService = makePriceService({}); // no price for SYMBOL

    await expect(
      placeOrder({
        userId: String(user._id),
        input: { symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty: QTY },
        idempotencyKey: `stale-${Date.now()}`,
        priceService: stalePriceService,
        vts: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'PRICE_UNAVAILABLE' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Authorization
  // ──────────────────────────────────────────────────────────────────────────

  it('Authorization: user B cannot cancel user A\'s order (404)', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const limitPrice = 148_000;

    const { order } = await placeOrder({
      userId: String(userA._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: QTY, limitPricePaise: limitPrice },
      idempotencyKey: `auth-test-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });

    await expect(
      cancelOrder({ userId: String(userB._id), orderId: String(order._id) }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cancel non-pending
  // ──────────────────────────────────────────────────────────────────────────

  it('Cancel FILLED order returns ORDER_NOT_CANCELLABLE', async () => {
    const user = await createUser();
    const { order } = await buyMarket(user);

    await expect(
      cancelOrder({ userId: String(user._id), orderId: String(order._id) }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Instrument validation
  // ──────────────────────────────────────────────────────────────────────────

  it('Unknown symbol returns INSTRUMENT_NOT_FOUND', async () => {
    const user = await createUser();
    await expect(
      placeOrder({
        userId: String(user._id),
        input: { symbol: 'FAKECOIN', side: 'BUY', type: 'MARKET', qty: 1 },
        idempotencyKey: `fake-${Date.now()}`,
        priceService: ps(PRICE),
        vts: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'INSTRUMENT_NOT_FOUND' });
  });

  it('Non-tradable instrument returns INSTRUMENT_NOT_TRADABLE', async () => {
    const user = await createUser();
    const indexPs = makePriceService({ NIFTY50: 2_500_000 });
    await expect(
      placeOrder({
        userId: String(user._id),
        input: { symbol: 'NIFTY50', side: 'BUY', type: 'MARKET', qty: 1 },
        idempotencyKey: `idx-${Date.now()}`,
        priceService: indexPs,
        vts: Date.now(),
      }),
    ).rejects.toMatchObject({ code: 'INSTRUMENT_NOT_TRADABLE' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Invariants test
  // ──────────────────────────────────────────────────────────────────────────

  it('Invariants: reservedCash <= cash, reservedQty <= qty after random ops', async () => {
    const user = await createUser();
    // Mix of buys and sells
    for (let i = 0; i < 5; i++) {
      try {
        await buyMarket(user, 2, PRICE);
      } catch (err) {
        void err;
      }
    }
    for (let i = 0; i < 3; i++) {
      try {
        await sellMarket(user, 1, PRICE + 5000);
      } catch (err) {
        void err;
      }
    }
    // Place a limit order
    try {
      await placeOrder({
        userId: String(user._id),
        input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: 1, limitPricePaise: 145_000 },
        idempotencyKey: `inv-lmt-${Date.now()}`,
        priceService: ps(PRICE),
        vts: Date.now(),
      });
    } catch (err) {
      void err;
    }

    const finalUser = await User.findById(user._id);
    expect(finalUser.cashPaise).toBeGreaterThanOrEqual(0);
    expect(finalUser.reservedCashPaise).toBeGreaterThanOrEqual(0);
    expect(finalUser.reservedCashPaise).toBeLessThanOrEqual(finalUser.cashPaise);

    const positions = await Position.find({ userId: user._id });
    for (const pos of positions) {
      expect(pos.qty).toBeGreaterThanOrEqual(0);
      expect(pos.reservedQty).toBeGreaterThanOrEqual(0);
      expect(pos.reservedQty).toBeLessThanOrEqual(pos.qty);
    }
  });

  it('LIMIT waits for a fresh crossing after registration', async () => {
    const user = await createUser();
    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: 2, limitPricePaise: PRICE },
      idempotencyKey: `mktable-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });
    expect(order.status).toBe('PENDING');
    const now = Date.now();
    await matcher.registerOrder(order, PRICE);
    await matcher.onTick(SYMBOL, PRICE + 500, now + 1);
    expect((await Order.findById(order._id)).status).toBe('PENDING');
    await matcher.onTick(SYMBOL, PRICE - 5, now + 2);
    const filled = await Order.findById(order._id);
    expect(filled.status).toBe('FILLED');
    expect(filled.filledPricePaise).toBe(PRICE - 5);
  });

  it('Session-restart guard: first tick after restart does not fill', async () => {
    const user = await createUser();
    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: 1, limitPricePaise: PRICE },
      idempotencyKey: `skip-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });
    await matcher.rebuild();
    matcher.markSessionRestart();
    const now = Date.now();
    await matcher.onTick(SYMBOL, PRICE - 500, now);
    expect((await Order.findById(order._id)).status).toBe('PENDING');
    await matcher.onTick(SYMBOL, PRICE + 500, now + 1);
    expect((await Order.findById(order._id)).status).toBe('PENDING');
    await matcher.onTick(SYMBOL, PRICE - 500, now + 2);
    expect((await Order.findById(order._id)).status).toBe('FILLED');
  });

  it('Restart recovery: rebuild from DB then later tick fills', async () => {
    const user = await createUser();
    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: 1, limitPricePaise: PRICE },
      idempotencyKey: `rebuild-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });
    matcher._index.clear();
    matcher._pendingCount = 0;
    await matcher.rebuild();
    expect(matcher.size()).toBeGreaterThan(0);
    const now = Date.now();
    matcher.markSessionRestart();
    await matcher.onTick(SYMBOL, PRICE, now);
    await matcher.onTick(SYMBOL, PRICE + 500, now + 1);
    expect((await Order.findById(order._id)).status).toBe('PENDING');
    await matcher.onTick(SYMBOL, PRICE - 5, now + 2);
    expect((await Order.findById(order._id)).status).toBe('FILLED');
  });

  it('Transaction rollback: trade insert failure leaves order PENDING', async () => {
    const user = await createUser();
    const { order } = await placeOrder({
      userId: String(user._id),
      input: { symbol: SYMBOL, side: 'BUY', type: 'LIMIT', qty: 1, limitPricePaise: PRICE },
      idempotencyKey: `rollback-${Date.now()}`,
      priceService: ps(PRICE),
      vts: Date.now(),
    });
    const before = await User.findById(user._id);
    const origCreate = TradeModel.create.bind(TradeModel);
    TradeModel.create = async () => {
      throw new Error('forced trade failure');
    };
    try {
      await expect(
        executeFill({ orderId: order._id, fillPricePaise: PRICE, vts: Date.now() }),
      ).rejects.toThrow(/forced trade failure/);
    } finally {
      TradeModel.create = origCreate;
    }
    const still = await Order.findById(order._id);
    expect(still.status).toBe('PENDING');
    const after = await User.findById(user._id);
    expect(after.cashPaise).toBe(before.cashPaise);
    expect(after.reservedCashPaise).toBe(before.reservedCashPaise);
  });
});
