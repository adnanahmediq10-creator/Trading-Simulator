/**
 * IST time formatting helpers for the UI.
 * The server sends virtualNowMs and vts as UTC epoch ms.
 * We display them in IST.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Format epoch ms as IST date+time string.
 * @param {number} ms
 * @returns {string} e.g. "Fri 25 Oct 2026 · 22:37:40 IST"
 */
export function formatVirtualTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms + IST_OFFSET_MS);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dow = days[d.getUTCDay()];
  const day = d.getUTCDate();
  const mon = months[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${dow} ${day} ${mon} ${yr} · ${hh}:${mm}:${ss} IST`;
}

/**
 * Format just the time portion in IST.
 * @param {number} ms
 */
export function formatISTTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms + IST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Convert epoch ms to lightweight-charts time (UTC seconds + IST offset).
 * lightweight-charts treats times as UTC seconds, so we shift by +5:30 to display IST.
 * @param {number} ms
 */
export function toChartTime(ms) {
  return Math.floor(ms / 1000) + 19800; // +5:30 in seconds
}

/**
 * Format a short relative time (e.g. "2m ago").
 * @param {number|string} dateStr
 */
export function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
