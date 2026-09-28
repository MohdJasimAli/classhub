import { ZodError, type ZodSchema } from 'zod';
import { AppError } from '../utils/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Builds a middleware that validates and *replaces* the given request segment
 * with the parsed result. Coercion and defaults are therefore applied, and
 * downstream handlers always work with well-typed data.
 */
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        // Express 5 makes req.query a getter-only property; assign defensively.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      } else {
        (req as unknown as Record<string, unknown>)[source] = parsed;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(formatZodError(error));
      }
      return next(error);
    }
  };
}

export function formatZodError(error: ZodError): AppError {
  return new AppError('Validation failed', 422, 'VALIDATION_ERROR', error.flatten());
}

/** Parse helper for use inside controllers (e.g. inside a transaction callback). */
export function parseOrThrow<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw formatZodError(result.error);
  return result.data;
}
