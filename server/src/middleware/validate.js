/**
 * Zod request validation helper used at route boundaries.
 */
import { DomainError } from '../engine/errors.js';

/**
 * @param {import('zod').ZodType} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return next(
        new DomainError('VALIDATION_ERROR', 'Invalid request', {
          details: parsed.error.flatten(),
          status: 400,
        }),
      );
    }
    req[source] = parsed.data;
    next();
  };
}
