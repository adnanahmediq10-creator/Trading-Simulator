/**
 * Circuit breaker: CLOSED → OPEN (after 5 failures) → HALF_OPEN (after backoff) → CLOSED
 * Used by the ingest job to wrap Yahoo Finance calls.
 */
import { logger } from '../utils/logger.js';

const MAX_FAILURES = 5;
const BASE_BACKOFF_MS = 30_000; // 30s
const MAX_BACKOFF_MS = 10 * 60 * 1000; // 10 min

export class CircuitBreaker {
  constructor(name = 'default') {
    this.name = name;
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.consecutiveFailures = 0;
    this.lastSuccessAt = null;
    this.lastFailureAt = null;
    this.nextRetryAt = null;
    this._backoffMs = BASE_BACKOFF_MS;
  }

  /**
   * Execute a function through the breaker.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextRetryAt) {
        throw new Error(`CircuitBreaker[${this.name}]: OPEN until ${new Date(this.nextRetryAt).toISOString()}`);
      }
      // Transition to HALF_OPEN for a trial request
      this.state = 'HALF_OPEN';
      logger.info({ name: this.name }, 'CircuitBreaker: HALF_OPEN trial');
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  _onSuccess() {
    this.consecutiveFailures = 0;
    this.lastSuccessAt = new Date().toISOString();
    this.nextRetryAt = null;
    this._backoffMs = BASE_BACKOFF_MS;
    if (this.state !== 'CLOSED') {
      logger.info({ name: this.name }, 'CircuitBreaker: CLOSED (recovered)');
    }
    this.state = 'CLOSED';
  }

  _onFailure(err) {
    this.consecutiveFailures++;
    this.lastFailureAt = new Date().toISOString();
    logger.warn(
      { name: this.name, failures: this.consecutiveFailures, err: err.message },
      'CircuitBreaker: failure',
    );

    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= MAX_FAILURES) {
      this._backoffMs = Math.min(this._backoffMs * 2, MAX_BACKOFF_MS);
      this.nextRetryAt = Date.now() + this._backoffMs;
      this.state = 'OPEN';
      logger.error(
        { name: this.name, nextRetryAt: new Date(this.nextRetryAt).toISOString() },
        'CircuitBreaker: OPEN',
      );
    }
  }

  getState() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt,
      nextRetryAt: this.nextRetryAt ? new Date(this.nextRetryAt).toISOString() : null,
    };
  }
}
