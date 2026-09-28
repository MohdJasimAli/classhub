import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'ADMIN' | 'STUDENT';
  name: string;
}

/**
 * Signs a stateless access token. The token carries only non-sensitive
 * identity claims; the user row is still re-read on privileged operations so
 * that deactivating a student takes effect immediately rather than at the next
 * token expiry.
 */
export function signAccessToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export const AUTH_COOKIE = 'classhub_token';

export const authCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
