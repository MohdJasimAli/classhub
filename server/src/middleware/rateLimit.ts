import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';

const jsonMessage = (message: string, code: string) => ({
  success: false as const,
  error: { code, message },
});

/** Broad limiter applied to the whole API surface. */
export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Too many requests. Please slow down.', 'RATE_LIMITED'),
});

/**
 * Strict limiter for credential endpoints. This is the main brake on
 * brute-force password guessing against /api/auth/*.
 */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts should count towards the limit.
  skipSuccessfulRequests: true,
  message: jsonMessage(
    'Too many failed attempts. Please try again in a few minutes.',
    'AUTH_RATE_LIMITED',
  ),
  // Key by IP + submitted email so a single account cannot be hammered from
  // many IPs, while one attacker cannot lock out an entire campus NAT range.
  //
  // `ipKeyGenerator` normalises IPv6 to a /64 subnet prefix. Using `req.ip`
  // directly would make each address unique, which both defeats the per-account
  // grouping and trips express-rate-limit's ERR_ERL_KEY_GEN_IPV6 guard.
  keyGenerator: (req: Request): string => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? 'unknown')}:${email}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json(
      jsonMessage(
        'Too many failed attempts. Please try again in a few minutes.',
        'AUTH_RATE_LIMITED',
      ),
    );
  },
});
