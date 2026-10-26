/**
 * CSRF defence: reject state-changing requests (POST/PUT/PATCH/DELETE)
 * whose Origin header does not match the app's own origin.
 * Spec: section 13.
 */
import { env } from '../config/env.js';
import { DomainError } from '../engine/errors.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function originCheck(req, _res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] ?? '';
    if (ct && !ct.includes('application/json')) {
      return next(
        new DomainError('VALIDATION_ERROR', 'Content-Type must be application/json', {
          status: 400,
        }),
      );
    }
  }

  const origin = req.headers.origin;
  if (!origin) return next(); // same-origin navigations / server-side calls have no Origin

  let allowed = false;
  try {
    const url = new URL(origin);
    if (env.NODE_ENV === 'production') {
      allowed = Boolean(req.headers.host) && url.host === req.headers.host;
    } else {
      allowed = origin === env.CLIENT_ORIGIN;
    }
  } catch {
    allowed = false;
  }

  if (!allowed) {
    return next(new DomainError('UNAUTHENTICATED', 'Origin not allowed', { status: 403 }));
  }
  next();
}
