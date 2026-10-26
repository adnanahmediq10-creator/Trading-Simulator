/**
 * API client — thin wrapper around fetch.
 * All requests go to /api (same-origin in both dev and prod).
 * Auth is via httpOnly cookie — no manual token handling.
 */

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data.error, raw: data };
  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // Market
  status: () => request('/market/status'),
  instruments: () => request('/market/instruments'),
  quotes: () => request('/market/quotes'),
  candles: (symbol, interval = '1m', limit = 500) =>
    request(`/market/candles?symbol=${symbol}&interval=${interval}&limit=${limit}`),

  // Orders
  placeOrder: (body, idempotencyKey) =>
    request('/orders', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  listOrders: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
    ).toString();
    return request(`/orders${qs ? `?${qs}` : ''}`);
  },
  cancelOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
  listTrades: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)),
    ).toString();
    return request(`/trades${qs ? `?${qs}` : ''}`);
  },

  // Portfolio
  portfolio: () => request('/portfolio'),

  // Account
  resetAccount: () => request('/account/reset', { method: 'POST', body: { confirm: true } }),

  // Health
  health: () => request('/health'),
};
