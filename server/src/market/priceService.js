/**
 * Price Service — 1 Hz ticker that generates ticks for all 12 instruments.
 * Emits: 'ticks' (every second), 'session-restart' (on epoch change)
 *
 * Each cycle is stateless w.r.t. the virtual clock — it re-derives from Date.now().
 * Errors per-symbol are caught and logged; the loop continues.
 */
import { EventEmitter } from 'node:events';
import { getHolidays, getEffectiveMode, getVirtualTime, sessionOpenMs, prevTradingDay } from './clock.js';
import { INSTRUMENTS } from '../config/instruments.js';
import { getSession } from './candleStore.js';
import { tickAt, formingBar } from './tickGenerator.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const MINUTE_MS = 60_000;
const SESSION_MINUTES = 375;

class PriceService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    /** @type {Map<string, object>} symbol → latest tick */
    this._latest = new Map();
    /** @type {Map<string, number>} symbol → wall time when tick was stored */
    this._receivedAt = new Map();
    this._intervalId = null;
    this._running = false;
    /** @type {string|null} last session epoch (to detect restarts) */
    this._lastEpoch = null;
    /** @type {string|null} last session date loaded for candle cache */
    this._cachedSessionDate = null;
    /** @type {Map<string, object[]>} symbol:sessionDate → candles array */
    this._sessionCandles = new Map();
    /** @type {Map<string, string>} symbol → data source */
    this._sources = new Map();
    /** @type {Map<string, number>} symbol → previous session last close */
    this._prevClose = new Map();
    /** @type {number|null} */
    this._lastTickAt = null;
    /** @type {object|null} last clock used to generate broadcast ticks */
    this._marketState = null;
    /** When DELAYED_LIVE has no Mongo candles, stay on DEMO_REPLAY. */
    this._liveUnavailable = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    // drift-tolerant: recompute from wall clock each tick
    this._intervalId = setInterval(() => {
      this._tick().catch((err) =>
        logger.error({ err: err.message }, 'PriceService tick error'),
      );
    }, 1000);
    // Eager first tick
    this._tick().catch((err) =>
      logger.error({ err: err.message }, 'PriceService first tick error'),
    );
    logger.info('PriceService started');
  }

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._running = false;
    logger.info('PriceService stopped');
  }

  /**
   * @param {string} symbol
   * @returns {object|null}
   */
  getLatest(symbol) {
    return this._latest.get(symbol) ?? null;
  }

  /**
   * @param {string} symbol
   * @returns {boolean}
   */
  isStale(symbol) {
    if (!this._running) return true;
    const receivedAt = this._receivedAt.get(symbol);
    if (!receivedAt) return true;
    return Date.now() - receivedAt > env.STALE_AFTER_MS;
  }

  getStatus() {
    return {
      running: this._running,
      lastTickAgeMs: this._lastTickAt ? Date.now() - this._lastTickAt : null,
    };
  }

  /**
   * Return the clock currently driving broadcast prices. REST market data must
   * use this same clock so candle history and live ticks share one timeline.
   * @returns {object|null}
   */
  getMarketState() {
    if (!this._marketState || !this._lastTickAt) return null;
    if (Date.now() - this._lastTickAt > env.STALE_AFTER_MS) return null;
    return this._marketState;
  }

  getDataSources() {
    return Object.fromEntries(this._sources);
  }

  /** Reload the active candle session after ingest has written fresh bars. */
  async refreshSession(sessionDate) {
    if (this._cachedSessionDate === sessionDate) this._cachedSessionDate = null;
    await this._preloadSession(sessionDate);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal ticker
  // ─────────────────────────────────────────────────────────────────────────

  async _tick() {
    const nowMs = Date.now();
    const holidays = getHolidays();

    let modeInfo = getEffectiveMode(nowMs, holidays, !this._liveUnavailable);
    await this._preloadSession(modeInfo.sessionDate);

    if (modeInfo.mode === 'DELAYED_LIVE') {
      const anyDb = [...this._sources.values()].some((s) => s === 'db');
      this._liveUnavailable = !anyDb;
      if (this._liveUnavailable) {
        modeInfo = getEffectiveMode(nowMs, holidays, false);
        await this._preloadSession(modeInfo.sessionDate);
      }
    } else {
      this._liveUnavailable = false;
    }

    const { virtualNowMs, sessionEpoch } = getVirtualTime(
      nowMs,
      { ...modeInfo, mode: modeInfo.effectiveMode ?? modeInfo.mode },
      env.REPLAY_SPEED,
    );

    // Session epoch change → emit session-restart before ticks
    if (sessionEpoch !== this._lastEpoch) {
      if (this._lastEpoch !== null) {
        this.emit('session-restart', {
          sessionEpoch,
          mode: modeInfo.effectiveMode ?? modeInfo.mode,
          sessionDate: modeInfo.sessionDate,
        });
      }
      this._lastEpoch = sessionEpoch;
    }

    // Compute ticks for all instruments
    const ticks = [];
    for (const inst of INSTRUMENTS) {
      try {
        const tick = await this._tickForSymbol(inst, virtualNowMs, modeInfo);
        if (tick) {
          this._latest.set(inst.symbol, tick);
          this._receivedAt.set(inst.symbol, nowMs);
          ticks.push(tick);
        }
      } catch (err) {
        logger.warn({ symbol: inst.symbol, err: err.message }, 'Tick error for symbol');
      }
    }

    this._lastTickAt = nowMs;

    const status = {
      mode: modeInfo.mode,
      effectiveMode: modeInfo.effectiveMode ?? modeInfo.mode,
      virtualNowMs,
      sessionEpoch,
      speed: env.REPLAY_SPEED,
      sessionDate: modeInfo.sessionDate,
      reason: modeInfo.reason,
    };
    this._marketState = status;

    if (ticks.length > 0) {
      this.emit('ticks', { ticks, status });
    }
  }

  /**
   * Pre-load all session candles for a date into memory.
   * @param {string} sessionDate
   */
  async _preloadSession(sessionDate) {
    if (this._cachedSessionDate === sessionDate) return;
    this._cachedSessionDate = sessionDate;
    this._sessionCandles.clear();

    for (const inst of INSTRUMENTS) {
      try {
        const { candles, source } = await getSession(inst.symbol, sessionDate);
        this._sessionCandles.set(`${inst.symbol}:${sessionDate}`, candles);
        this._sources.set(inst.symbol, source);
        const previous = await getSession(inst.symbol, prevTradingDay(sessionDate, getHolidays()));
        const previousClose = previous.candles.at(-1)?.c;
        if (Number.isSafeInteger(previousClose) && previousClose > 0) {
          this._prevClose.set(inst.symbol, previousClose);
        }
      } catch (err) {
        logger.warn({ symbol: inst.symbol, err: err.message }, 'Session preload failed');
      }
    }
    logger.info({ sessionDate, instruments: INSTRUMENTS.length }, 'Session candles preloaded');
  }

  /**
   * Compute tick for one instrument.
   * @param {object} inst
   * @param {number} virtualNowMs
   * @param {object} modeInfo
   */
  async _tickForSymbol(inst, virtualNowMs, modeInfo) {
    const { sessionDate } = modeInfo;
    const cacheKey = `${inst.symbol}:${sessionDate}`;

    // Get candles from memory cache
    let candles = this._sessionCandles.get(cacheKey);
    if (!candles) {
      const result = await getSession(inst.symbol, sessionDate);
      candles = result.candles;
      this._sessionCandles.set(cacheKey, candles);
      this._sources.set(inst.symbol, result.source);
    }

    // Find which candle the virtual time falls in
    const openMs = sessionOpenMs(sessionDate);
    const offsetMs = virtualNowMs - openMs;
    const minuteIndex = Math.min(
      SESSION_MINUTES - 1,
      Math.max(0, Math.floor(offsetMs / MINUTE_MS)),
    );
    const secIdx = Math.min(59, Math.max(0, Math.floor((offsetMs % MINUTE_MS) / 1000)));

    const candle = candles[minuteIndex];
    if (!candle) return null;

    const pricePaise = tickAt(inst.symbol, candle, secIdx);
    const bar = formingBar(inst.symbol, candle, secIdx);

    // day open and prev close
    const dayOpenCandle = candles[0];
    const dayOpenPaise = dayOpenCandle ? tickAt(inst.symbol, dayOpenCandle, 0) : pricePaise;
    const prevClosePaise = this._prevClose.get(inst.symbol) ?? pricePaise;

    const source = this._sources.get(inst.symbol) ?? 'synthetic';
    const isGap = !!candle.gap;

    return {
      symbol: inst.symbol,
      pricePaise,
      vts: virtualNowMs,
      bar,
      source: modeInfo.effectiveMode === 'DEMO_REPLAY' ? 'replay' : source === 'synthetic' ? 'synthetic' : 'delayed',
      gap: isGap || undefined,
      dayOpenPaise,
      prevClosePaise,
    };
  }

  /**
   * Called by ingest to update previous close after a session completes.
   * @param {string} symbol
   * @param {number} closePaise
   */
  setPrevClose(symbol, closePaise) {
    this._prevClose.set(symbol, closePaise);
  }
}

export const priceService = new PriceService();
