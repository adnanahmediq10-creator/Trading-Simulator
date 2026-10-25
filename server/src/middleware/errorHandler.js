import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { DomainError } from '../engine/errors.js';

/**
 * @param {unknown} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  if (err instanceof DomainError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.flatten(),
      },
    });
  }

  logger.error({ err, path: req.path, reqId: req.id }, 'Unhandled error');

  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err instanceof Error
            ? err.message
            : 'Unknown error',
    },
  });
}
