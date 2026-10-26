/**
 * Rate limiters for different route groups.
 */
import rateLimit from 'express-rate-limit';

function makeHandler(message) {
  return (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message,
      },
    });
  };
}

/** Auth endpoints: 10 requests per 15 minutes per IP */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many auth attempts. Try again in 15 minutes.'),
});

/** Order placement: 30 per minute per user (keyed by user IP as proxy) */
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? req.ip,
  handler: makeHandler('Too many orders. Try again in a minute.'),
});

/** General API: 300 per minute per IP */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many requests. Please slow down.'),
});
