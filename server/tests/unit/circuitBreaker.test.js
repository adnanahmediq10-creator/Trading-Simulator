/**
 * Unit tests for circuit breaker state machine.
 */
import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from '../../src/market/circuitBreaker.js';

describe('CircuitBreaker', () => {
  it('starts CLOSED', () => {
    const cb = new CircuitBreaker('test');
    expect(cb.state).toBe('CLOSED');
    expect(cb.consecutiveFailures).toBe(0);
  });

  it('stays CLOSED on success', async () => {
    const cb = new CircuitBreaker('test');
    await cb.execute(async () => 'ok');
    expect(cb.state).toBe('CLOSED');
    expect(cb.consecutiveFailures).toBe(0);
    expect(cb.lastSuccessAt).toBeTruthy();
  });

  it('increments failures on error', async () => {
    const cb = new CircuitBreaker('test');
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(cb.consecutiveFailures).toBe(1);
    expect(cb.state).toBe('CLOSED'); // Not open yet
  });

  it('opens after 5 consecutive failures', async () => {
    const cb = new CircuitBreaker('test');
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');
    expect(cb.nextRetryAt).toBeGreaterThan(Date.now());
  });

  it('OPEN: rejects immediately without calling fn', async () => {
    const cb = new CircuitBreaker('test');
    // Force OPEN
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(cb.execute(fn)).rejects.toThrow(/OPEN/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('HALF_OPEN: transitions to CLOSED on next success', async () => {
    const cb = new CircuitBreaker('test');
    // Force OPEN
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.state).toBe('OPEN');

    // Manually set nextRetryAt in the past to trigger HALF_OPEN
    cb.nextRetryAt = Date.now() - 1;

    // Next execute should go HALF_OPEN → CLOSED
    const result = await cb.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.state).toBe('CLOSED');
    expect(cb.consecutiveFailures).toBe(0);
  });

  it('HALF_OPEN: goes back to OPEN on failure', async () => {
    const cb = new CircuitBreaker('test');
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    cb.nextRetryAt = Date.now() - 1;

    await expect(cb.execute(() => Promise.reject(new Error('still failing')))).rejects.toThrow();
    expect(cb.state).toBe('OPEN');
    // Backoff should have doubled
    expect(cb.nextRetryAt).toBeGreaterThan(Date.now());
  });

  it('getState returns correct shape', () => {
    const cb = new CircuitBreaker('test');
    const state = cb.getState();
    expect(state).toHaveProperty('state', 'CLOSED');
    expect(state).toHaveProperty('consecutiveFailures', 0);
    expect(state).toHaveProperty('lastSuccessAt');
    expect(state).toHaveProperty('nextRetryAt');
  });

  it('resets consecutiveFailures to 0 on success after partial failures', async () => {
    const cb = new CircuitBreaker('test');
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(cb.consecutiveFailures).toBe(2);

    await cb.execute(async () => 'ok');
    expect(cb.consecutiveFailures).toBe(0);
    expect(cb.state).toBe('CLOSED');
  });
});
