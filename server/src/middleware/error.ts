import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { formatZodError } from './validate.js';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
}

/**
 * Central error translator. Every failure leaves the API in the same envelope
 * shape, so the client only needs one error path.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
   
  _next: NextFunction,
) {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    const formatted = formatZodError(err);
    statusCode = formatted.statusCode;
    code = formatted.code;
    message = formatted.message;
    details = formatted.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    ({ statusCode, code, message } = mapPrismaError(err));
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'The data submitted is not valid';
  } else if (err instanceof multer.MulterError) {
    const mapped = mapMulterError(err);
    statusCode = mapped.statusCode;
    code = mapped.code;
    message = mapped.message;
  } else if (err instanceof jwt.TokenExpiredError) {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Your session has expired. Please sign in again.';
  } else if (err instanceof jwt.JsonWebTokenError) {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Your session is invalid. Please sign in again.';
  } else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err instanceof Error) {
    message = err.message;
  }

  if (statusCode >= 500) {
    // Unexpected errors are logged server-side and never leak internals.
     
    console.error('[error]', err);
    if (!(err instanceof AppError)) message = 'An unexpected error occurred';
  } else {
     
    console.warn(`[warn] ${code}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(!env.isProd && statusCode >= 500 && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}

/** eslint-disable @typescript-eslint/no-explicit-any */
function mapPrismaError(err: Prisma.PrismaClientKnownRequestError) {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | string | undefined) ?? [];
      const field = Array.isArray(target) ? target.join(', ') : String(target);
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: field
          ? `A record with this ${field} already exists`
          : 'A record with these values already exists',
      };
    }
    case 'P2003':
      return {
        statusCode: 409,
        code: 'FOREIGN_KEY_CONSTRAINT',
        message: 'This operation references a record that does not exist',
      };
    case 'P2025':
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Record not found' };
    default:
      return { statusCode: 500, code: 'DATABASE_ERROR', message: 'A database error occurred' };
  }
}

function mapMulterError(err: multer.MulterError) {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return {
        statusCode: 413,
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the maximum allowed size of ${env.MAX_FILE_SIZE_MB} MB`,
      };
    case 'LIMIT_UNEXPECTED_FILE':
      return { statusCode: 400, code: 'UNEXPECTED_FILE', message: 'Unexpected file field' };
    case 'LIMIT_FILE_COUNT':
      return { statusCode: 400, code: 'TOO_MANY_FILES', message: 'Too many files uploaded' };
    default:
      return { statusCode: 400, code: 'UPLOAD_ERROR', message: err.message };
  }
}
