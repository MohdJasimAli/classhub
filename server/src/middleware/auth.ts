import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { unauthorized, forbidden } from '../utils/errors.js';
import { AUTH_COOKIE, verifyAccessToken } from '../utils/jwt.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'STUDENT';
  isActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE];
  if (cookie) return cookie;
  return null;
}

/**
 * Verifies the JWT and loads the current user record.
 *
 * Re-reading the user (rather than trusting the token payload) means that
 * deactivating or deleting an account revokes access immediately.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized('You must be signed in to access this resource');

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user) throw unauthorized('Your account no longer exists');
    if (!user.isActive) throw forbidden('Your account has been deactivated. Contact your administrator.');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-based access control. Must run after `requireAuth`.
 *
 * This is the chokepoint that guarantees students can never reach an admin
 * API, regardless of what the client sends.
 */
export function requireRole(...roles: Array<'ADMIN' | 'STUDENT'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        forbidden(
          `This action requires ${roles.length === 1 ? '' : 'one of the '}following role(s): ${roles.join(', ')}`,
        ),
      );
    }
    return next();
  };
}

/** Convenience guard: admin-only endpoints. */
export const requireAdmin = requireRole('ADMIN');

/** Narrowing helper for handlers that run behind `requireAuth`. */
export function currentUser(req: Request): AuthenticatedUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
