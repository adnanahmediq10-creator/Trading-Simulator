/**
 * Money helpers — all amounts in paise (integer).
 * Section 5 of spec.
 */

/**
 * Guard that a value is a safe integer (optionally non-negative).
 * @param {number} n
 * @param {string} [_label]
 * @param {boolean} [minZero=false]
 */
export function assertPaise(n, _label, minZero = false) {
  if (!Number.isSafeInteger(n)) {
    throw new TypeError(`Expected safe integer paise, got: ${n}`);
  }
  if (minZero && n < 0) {
    throw new TypeError(`Expected non-negative paise, got: ${n}`);
  }
}

/**
 * Round a numeric amount to integer paise.
 * @param {number} n
 * @returns {number}
 */
export function safePaise(n) {
  return Math.round(n);
}

/**
 * Convert a rupee float to paise integer.
 * @param {number} rupees
 * @returns {number}
 */
export function toPaise(rupees) {
  return Math.round(rupees * 100);
}

/** @param {number} paise */
export function paiseToRupees(paise) {
  return paise / 100;
}

/**
 * Multiply paise × qty safely.
 * @param {number} paise
 * @param {number} qty
 * @returns {number}
 */
export function mulPaise(paise, qty) {
  const result = paise * qty;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`mulPaise overflow: ${paise} * ${qty} = ${result}`);
  }
  return result;
}

/**
 * Weighted average cost when adding qty shares at price paise.
 * Uses integer math throughout.
 * @param {number} oldQty
 * @param {number} oldAvgPaise
 * @param {number} addQty
 * @param {number} addPricePaise
 * @returns {number}
 */
export function weightedAvg(oldQty, oldAvgPaise, addQty, addPricePaise) {
  if (addQty <= 0) return oldAvgPaise;
  if (oldQty <= 0) return addPricePaise;
  const total = oldQty + addQty;
  return Math.round((oldQty * oldAvgPaise + addQty * addPricePaise) / total);
}

/** Alias used by tests / callers that prefer the longer name. */
export const weightedAvgCost = weightedAvg;

/**
 * Realised P&L on a sell = (sellPrice - avgCost) * qty (integer arithmetic).
 * @param {number} sellPricePaise
 * @param {number} avgCostPaise
 * @param {number} qty
 * @returns {number}
 */
export function realizedPnl(sellPricePaise, avgCostPaise, qty) {
  return (sellPricePaise - avgCostPaise) * qty;
}

/** Tick size in paise */
export const TICK_SIZE_PAISE = 5;

/**
 * Check that a price is a positive multiple of tick size.
 * @param {number} paise
 * @returns {boolean}
 */
export function isValidPrice(paise) {
  return Number.isSafeInteger(paise) && paise > 0 && paise % TICK_SIZE_PAISE === 0;
}
