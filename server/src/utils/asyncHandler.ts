import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * ---------------------------------------------------------------------------
 * Async route handler wrapper.
 *
 * Express 4 does NOT forward a rejected promise from an async handler to the
 * error middleware. Without this wrapper, any `throw` inside an async
 * controller leaves the request hanging until the client times out, and the
 * error surfaces only as an unhandled rejection in the server log.
 *
 * Wrapping every controller at the route boundary guarantees that both
 * `throw AppError(...)` and unexpected exceptions reach the central error
 * handler and become a proper HTTP response.
 * ---------------------------------------------------------------------------
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = unknown,
>(
  handler: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
