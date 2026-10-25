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

  const origin = req.headers.origin;
  if (!origin) return next(); // same-origin requests (e.g. server-side) have no Origin

  const allowed =
    env.NODE_ENV === 'production'
      ? req.headers.host && origin.endsWith(req.headers.host)
      : origin === env.CLIENT_ORIGIN;

  if (!allowed) {
    return next(new DomainError('UNAUTHENTICATED', 'Origin not allowed', { status: 403 }));
  }
  next();
}
