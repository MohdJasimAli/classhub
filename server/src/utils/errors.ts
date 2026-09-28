/**
 * Application error type. Controllers throw these; the central error
 * middleware translates them into proper HTTP responses.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(message, 400, 'BAD_REQUEST', details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(message, 401, 'UNAUTHORIZED');

export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(message, 403, 'FORBIDDEN');

export const notFound = (message = 'Resource not found') =>
  new AppError(message, 404, 'NOT_FOUND');

export const conflict = (message: string, details?: unknown) =>
  new AppError(message, 409, 'CONFLICT', details);

export const payloadTooLarge = (message: string) =>
  new AppError(message, 413, 'PAYLOAD_TOO_LARGE');

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);
