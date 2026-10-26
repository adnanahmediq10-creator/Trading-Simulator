/**
 * CSRF defence: reject state-changing requests (POST/PUT/PATCH/DELETE)
 * whose Origin header does not match the app's own origin.
 * Spec: section 13.
 *
 * In development, Vite proxies requests with changeOrigin:true which rewrites
 * the Origin to the server's own host. We allow any localhost origin in dev.
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
  // No Origin header = same-origin request (e.g. server-side curl, proxied)
  if (!origin) return next();

  let allowed = false;
  try {
    const parsedOrigin = new URL(origin);
    const isLocalOrigin =
      parsedOrigin.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname.toLowerCase());

    if (env.NODE_ENV === 'production') {
      // The frontend may be hosted separately from the API. Match its configured origin exactly.
      allowed = parsedOrigin.origin === new URL(env.CLIENT_ORIGIN).origin;
    } else {
      // Vite's dev server uses a different port from the API, so allow explicit local origins.
      allowed = isLocalOrigin || origin === env.CLIENT_ORIGIN;
    }
  } catch {
    // Invalid Origin values are rejected below.
  }

  if (!allowed) {
    return next(new DomainError('UNAUTHENTICATED', 'Origin not allowed', { status: 403 }));
  }
  next();
}
