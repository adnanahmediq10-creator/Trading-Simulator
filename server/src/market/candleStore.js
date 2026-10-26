/**
 * Candle Store — three-tier fallback chain:
 *   1. MongoDB (ingest-populated `candles` collection)
 *   2. Committed snapshot JSON (loaded once at boot)
 *   3. Synthetic session (seeded random walk)
 *
 * getSession(symbol, sessionDate) → { candles, source }
 * getDaily(symbol, beforeDate, limit) → { candles, source }
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Candle } from '../models/Candle.js';
import { getInstrument, INSTRUMENTS } from '../config/instruments.js';
import { generateSession, generateDaily, sessionOpenMs } from './synthetic.js';
import { fillGaps } from './candles.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, '../../data/snapshot');
const SESSION_MINUTES = 375;

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot loader — loaded once at boot, cached in memory
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, { sessions: Record<string, object[]>, daily: object[] }>} */
const snapshotCache = new Map();
/** @type {Map<string, string>} symbol → last daily close source */
const snapshotLastClose = new Map();

/** Load all snapshot files into memory. Call once at boot. */
export async function loadSnapshots() {
  const loaded = [];
  for (const inst of INSTRUMENTS) {
    try {
      const filePath = path.join(SNAPSHOT_DIR, `${inst.symbol}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      snapshotCache.set(inst.symbol, data);

      // Record last daily close for synthetic seeding
      if (Array.isArray(data.daily) && data.daily.length > 0) {
        snapshotLastClose.set(inst.symbol, data.daily[data.daily.length - 1].c);
      }
      loaded.push(inst.symbol);
    } catch (err) {
      logger.warn({ symbol: inst.symbol, err: err.message }, 'Snapshot not found, synthetic only');
    }
  }
  logger.info({ count: loaded.length }, 'Snapshots loaded into memory');
}

/** Get last known close from snapshot daily data, or basePricePaise */
function getLastClose(symbol) {
  if (snapshotLastClose.has(symbol)) return snapshotLastClose.get(symbol);
  const inst = getInstrument(symbol);
  return inst?.basePricePaise ?? 100_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session candle getter
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, { candles: object[], source: string }>} */
const sessionCache = new Map();

/**
 * Get 1m candles for a session, with fallback chain.
 * @param {string} symbol
 * @param {string} sessionDate 'YYYY-MM-DD'
 * @param {{ noDb?: boolean }} [opts]
 * @returns {Promise<{ candles: object[], source: 'db'|'snapshot'|'synthetic' }>}
 */
export async function getSession(symbol, sessionDate, opts = {}) {
  const cacheKey = `${symbol}:${sessionDate}`;

  // ── Tier 1: MongoDB ───────────────────────────────────────────────────────
  if (!opts.noDb) {
    try {
      const openMs = sessionOpenMs(sessionDate);
      const closeMs = openMs + SESSION_MINUTES * 60_000;
      const docs = await Candle.find({
        symbol,
        interval: '1m',
        t: { $gte: openMs, $lt: closeMs },
      })
        .sort({ t: 1 })
        .lean();

      if (docs && docs.length >= 50) {
        // enough candles to be a real session
        const candles = fillGaps(docs.map(toPlain), sessionDate);
        sessionCache.set(cacheKey, { candles, source: 'db' });
        return { candles, source: 'db' };
      }
    } catch (err) {
      logger.warn({ symbol, sessionDate, err: err.message }, 'DB session fetch failed');
    }
  }

  // ── Tier 2: Snapshot ──────────────────────────────────────────────────────
  const snap = snapshotCache.get(symbol);
  if (snap?.sessions?.[sessionDate]?.length >= 50) {
    const candles = fillGaps(snap.sessions[sessionDate], sessionDate);
    sessionCache.set(cacheKey, { candles, source: 'snapshot' });
    return { candles, source: 'snapshot' };
  }

  // ── Tier 3: Synthetic ─────────────────────────────────────────────────────
  const startClose = getLastClose(symbol);
  const candles = generateSession(symbol, sessionDate, startClose);
  sessionCache.set(cacheKey, { candles, source: 'synthetic' });
  return { candles, source: 'synthetic' };
}

/**
 * Get a specific 1m candle (by virtual minute index).
 * Uses the in-memory session cache.
 * @param {string} symbol
 * @param {string} sessionDate
 * @param {number} minuteIndex 0..374
 * @returns {Promise<{ candle: object|null, source: string }>}
 */
export async function getSessionCandle(symbol, sessionDate, minuteIndex) {
  const cacheKey = `${symbol}:${sessionDate}`;
  let entry = sessionCache.get(cacheKey);
  if (!entry) {
    entry = await getSession(symbol, sessionDate);
  }
  const candle = entry.candles[minuteIndex] ?? null;
  return { candle, source: entry.source };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily candle getter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} symbol
 * @param {string} beforeDate exclusive upper bound 'YYYY-MM-DD'
 * @param {number} limit max candles (capped at 500)
 * @returns {Promise<{ candles: object[], source: 'db'|'snapshot'|'synthetic' }>}
 */
export async function getDaily(symbol, beforeDate, limit = 250) {
  const maxLimit = Math.min(limit, 500);
  const [y, m, d] = beforeDate.split('-').map(Number);
  const beforeMs = Date.UTC(y, m - 1, d);

  // ── Tier 1: MongoDB ───────────────────────────────────────────────────────
  try {
    const docs = await Candle.find({
      symbol,
      interval: '1d',
      t: { $lt: beforeMs },
    })
      .sort({ t: -1 })
      .limit(maxLimit)
      .lean();

    if (docs && docs.length > 0) {
      return { candles: docs.map(toPlain).reverse(), source: 'db' };
    }
  } catch (err) {
    logger.warn({ symbol, err: err.message }, 'DB daily fetch failed');
  }

  // ── Tier 2: Snapshot ──────────────────────────────────────────────────────
  const snap = snapshotCache.get(symbol);
  if (snap?.daily?.length > 0) {
    const filtered = snap.daily
      .filter((c) => c.t < beforeMs)
      .slice(-maxLimit);
    if (filtered.length > 0) {
      return { candles: filtered, source: 'snapshot' };
    }
  }

  // ── Tier 3: Synthetic ─────────────────────────────────────────────────────
  const base = getLastClose(symbol);
  const candles = generateDaily(symbol, base, maxLimit);
  return { candles: candles.filter((c) => c.t < beforeMs), source: 'synthetic' };
}

/** @type {Map<string, string>} symbol → source label */
export function getDataSources() {
  const result = {};
  for (const inst of INSTRUMENTS) {
    // Find any cached entry for this symbol
    let source = 'synthetic';
    for (const [key, val] of sessionCache) {
      if (key.startsWith(inst.symbol + ':')) {
        source = val.source;
        break;
      }
    }
    result[inst.symbol] = source;
  }
  return result;
}

/** Strip Mongoose document metadata */
function toPlain(doc) {
  const rest = { ...doc };
  delete rest._id;
  delete rest.__v;
  return rest;
}
