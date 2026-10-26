/**
 * Money formatting helpers — display only.
 * All values from API are in paise (integers).
 * Never store floats; only format at the UI boundary.
 */

const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format paise as ₹ amount.
 * @param {number|null|undefined} paise
 * @returns {string}
 */
export function formatINR(paise) {
  if (paise == null) return '—';
  return fmt.format(paise / 100);
}

/**
 * Format paise as compact ₹ (₹1.23L, ₹45K).
 * @param {number} paise
 */
export function formatINRCompact(paise) {
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 1_00_000) {
    return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  }
  if (Math.abs(rupees) >= 1_000) {
    return `₹${(rupees / 1_000).toFixed(1)}K`;
  }
  return `₹${rupees.toFixed(2)}`;
}

/**
 * Format a P&L value with sign and color class.
 * @param {number} paise
 * @returns {{ text: string, cls: string }}
 */
export function formatPnl(paise) {
  if (paise === 0) return { text: '₹0.00', cls: 'pnl-zero' };
  const sign = paise > 0 ? '+' : '';
  return {
    text: `${sign}${formatINR(paise)}`,
    cls: paise > 0 ? 'pnl-pos' : 'pnl-neg',
  };
}

/**
 * Format a % change.
 * @param {number} pct
 */
export function formatPct(pct) {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Convert a rupee string input to paise integer.
 * Returns null if invalid.
 * @param {string} val
 */
export function rupeesToPaise(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Check if paise is a valid NSE tick size (multiple of 5).
 * @param {number} paise
 */
export function isValidTick(paise) {
  return Number.isInteger(paise) && paise > 0 && paise % 5 === 0;
}
