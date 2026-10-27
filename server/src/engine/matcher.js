/**
 * Matcher — in-memory index of PENDING LIMIT orders.
 * Subscribes to price service ticks and fills eligible orders.
 *
 * Design principles (spec 12.5):
 * - Rebuilt from MongoDB at boot for restart safety
 * - Per-symbol sequential promise queue (no concurrent fills for same symbol)
 * - Session-restart guard: first tick of a new epoch is skipped for matching
 * - Single-instance only (scale-out requires leader election or a queue)
 */
import { Order } from '../models/Order.js';
import { executeFill } from './executeFill.js';
import { logger } from '../utils/logger.js';
import { INSTRUMENTS } from '../config/instruments.js';

/**
 * @typedef {{ _id: string, userId: string, symbol: string, side: 'BUY'|'SELL',
 *   limitPricePaise: number, qty: number, createdAt: Date }} PendingOrder
 */

class Matcher {
  constructor() {
    /** @type {Map<string, { buys: PendingOrder[], sells: PendingOrder[] }>} */
    this._index = new Map();
    /** @type {Map<string, number>} last observed price for each pending order */
    this._lastPriceByOrder = new Map();
    /** @type {Set<string>} orders already triggered and awaiting a successful fill */
    this._triggeredOrders = new Set();
    /** @type {Map<string, Promise>} symbol → current processing promise */
    this._queues = new Map();
    /** @type {Set<string>} symbols awaiting first-tick-skip after session restart */
    this._skipNext = new Set();
    /** @type {object|null} io handle */
    this._io = null;
    /** @type {number} */
    this._pendingCount = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /** @param {object} io Socket.IO server */
  setIo(io) {
    this._io = io;
  }

  /**
   * Rebuild in-memory index from MongoDB.
   * Called at boot and after restart.
   */
  async rebuild() {
    this._index.clear();
    this._lastPriceByOrder.clear();
    this._triggeredOrders.clear();
    this._pendingCount = 0;
    const pending = await Order.find({ status: 'PENDING', type: 'LIMIT' })
      .sort({ createdAt: 1 })
      .lean();

    for (const order of pending) {
      this._addToIndex(order);
    }
    logger.info({ count: pending.length }, 'Matcher index rebuilt from DB');
  }

  /**
   * Register a newly placed PENDING order and use the current quote as its
   * baseline. It can fill only after a later tick crosses the limit.
   * @param {object} order
   * @param {number} [tickPrice]
   */
  async registerOrder(order, tickPrice) {
    this._addToIndex(order);
    if (tickPrice != null) this._lastPriceByOrder.set(String(order._id), tickPrice);
  }

  /**
   * Remove an order from the index (after fill or cancel).
   * @param {string} orderId
   * @param {string} symbol
   */
  removeOrder(orderId, symbol) {
    const bucket = this._index.get(symbol);
    if (!bucket) return;
    const initialBuys = bucket.buys.length;
    const initialSells = bucket.sells.length;
    bucket.buys = bucket.buys.filter((o) => String(o._id) !== String(orderId));
    bucket.sells = bucket.sells.filter((o) => String(o._id) !== String(orderId));
    this._lastPriceByOrder.delete(String(orderId));
    this._triggeredOrders.delete(String(orderId));
    const removed = (initialBuys - bucket.buys.length) + (initialSells - bucket.sells.length);
    this._pendingCount -= removed;
  }

  /** @returns {number} */
  size() {
    return this._pendingCount;
  }

  /** Test/helper: process one tick as the price service would. */
  async onTick(symbol, pricePaise, vts) {
    await this._processTick(symbol, pricePaise, vts);
  }

  /** Test/helper: arm the session-restart skip for every symbol. */
  markSessionRestart() {
    for (const inst of INSTRUMENTS) this._skipNext.add(inst.symbol);
  }

  /**
   * Subscribe to price service events.
   * @param {import('../market/priceService.js').PriceService} priceService
   */
  subscribe(priceService) {
    // On process startup, the first observed tick can also be a session jump.
    this.markSessionRestart();
    priceService.on('ticks', ({ ticks }) => {
      for (const tick of ticks) {
        this._enqueue(tick.symbol, () => this._processTick(tick.symbol, tick.pricePaise, tick.vts));
      }
    });

    priceService.on('session-restart', ({ sessionEpoch }) => {
      logger.info({ sessionEpoch }, 'Matcher: session restart — skipping first tick for all symbols');
      for (const inst of INSTRUMENTS) {
        this._skipNext.add(inst.symbol);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** @param {object} order */
  _addToIndex(order) {
    if (!this._index.has(order.symbol)) {
      this._index.set(order.symbol, { buys: [], sells: [] });
    }
    const bucket = this._index.get(order.symbol);
    const id = String(order._id);
    if (
      bucket.buys.some((o) => String(o._id) === id) ||
      bucket.sells.some((o) => String(o._id) === id)
    ) {
      return;
    }
    if (order.side === 'BUY') {
      bucket.buys.push(order);
      bucket.buys.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else {
      bucket.sells.push(order);
      bucket.sells.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    this._pendingCount++;
  }

  /**
   * Enqueue a task for a symbol (sequential processing per symbol).
   * @param {string} symbol
   * @param {() => Promise} task
   */
  _enqueue(symbol, task) {
    const prev = this._queues.get(symbol) ?? Promise.resolve();
    const next = prev.then(task).catch((err) => {
      logger.error({ symbol, err: err.message }, 'Matcher queue error');
    });
    this._queues.set(symbol, next);
  }

  /**
   * Process a market tick and fill orders only when their target is crossed.
   * @param {string} symbol
   * @param {number} pricePaise
   * @param {number} vts
   */
  async _processTick(symbol, pricePaise, vts) {
    const bucket = this._index.get(symbol);

    // Session-restart guard: skip first ticker tick of a new epoch
    if (this._skipNext.has(symbol)) {
      this._skipNext.delete(symbol);
      for (const order of [...(bucket?.buys ?? []), ...(bucket?.sells ?? [])]) {
        const id = String(order._id);
        this._lastPriceByOrder.set(id, pricePaise);
        this._triggeredOrders.delete(id);
      }
      return;
    }

    if (!bucket) return;

    // A limit order activates only on a fresh crossing after it was placed.
    // BUY: price falls from above the limit to the limit or below.
    // SELL: price rises from below the limit to the limit or above.
    const crossed = (orders, side) => orders.filter((order) => {
      const id = String(order._id);
      if (this._triggeredOrders.has(id)) return true;
      const previousPrice = this._lastPriceByOrder.get(id);
      this._lastPriceByOrder.set(id, pricePaise);
      if (previousPrice == null) return false;
      const didCross = side === 'BUY'
        ? previousPrice > order.limitPricePaise && pricePaise <= order.limitPricePaise
        : previousPrice < order.limitPricePaise && pricePaise >= order.limitPricePaise;
      if (didCross) this._triggeredOrders.add(id);
      return didCross;
    });

    const triggeredBuys = crossed(bucket.buys, 'BUY');
    const triggeredSells = crossed(bucket.sells, 'SELL');

    for (const order of [...triggeredBuys, ...triggeredSells]) {
      try {
        const result = await executeFill({
          orderId: order._id,
          fillPricePaise: pricePaise,
          vts,
          io: this._io,
        });

        if (result) {
          // Successfully filled — remove from index
          this.removeOrder(order._id, symbol);
        } else {
          // Already filled or cancelled — remove from index (stale entry)
          this.removeOrder(order._id, symbol);
        }
      } catch (err) {
        logger.error({ orderId: order._id, symbol, err: err.message }, 'Matcher fill error');
        // Leave in index — next tick will retry
        // But if it was already not pending (e.g. already filled), remove it
        if (err.code === 'ORDER_NOT_FOUND') {
          this.removeOrder(order._id, symbol);
        }
      }
    }
  }
}

export const matcher = new Matcher();
