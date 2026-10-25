/** @typedef {import('zod').infer<typeof import('zod').z.any>} never */

/** @type {Record<string, number>} */
const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INSTRUMENT_NOT_FOUND: 404,
  INSTRUMENT_NOT_TRADABLE: 400,
  PRICE_UNAVAILABLE: 503,
  PRICE_OUT_OF_BAND: 400,
  INSUFFICIENT_FUNDS: 400,
  INSUFFICIENT_SHARES: 400,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_CANCELLABLE: 409,
  DUPLICATE_REQUEST: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class DomainError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ status?: number, details?: Record<string, unknown> }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = opts.status ?? STATUS_BY_CODE[code] ?? 500;
    this.details = opts.details;
  }
}
