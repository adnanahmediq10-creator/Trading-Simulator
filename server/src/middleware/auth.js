/**
 * JWT authentication middleware.
 * Reads token from httpOnly cookie 'token'.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { DomainError } from '../engine/errors.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return next(new DomainError('UNAUTHENTICATED', 'Authentication required'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    /** @type {string} */
    req.userId = payload.sub;
    next();
  } catch {
    next(new DomainError('UNAUTHENTICATED', 'Invalid or expired session'));
  }
}

/**
 * Optional auth: sets req.userId if cookie is valid, otherwise continues unauthenticated.
 */
export function optionalAuth(req, _res, next) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      req.userId = payload.sub;
    } catch {
      // Ignore invalid token for optional auth
    }
  }
  next();
}
