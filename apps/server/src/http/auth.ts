import type { NextFunction, Request, Response } from 'express';
import { isProd } from '../config/env.js';
import { SESSION_COOKIE, findValidSession, parseCookies } from '../services/sessions.js';
import { HttpError } from './errors.js';

/** Single-operator auth: a hashed, DB-backed session token in an httpOnly cookie. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!(await findValidSession(token))) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in to continue' } });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Simple in-memory limiter — good enough for one operator, no Redis dependency. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 5 * 60 * 1000 });
    next();
    return;
  }
  entry.count += 1;
  if (entry.count > 5) {
    next(new HttpError(429, 'Too many attempts. Try again in a few minutes.', 'rate_limited'));
    return;
  }
  next();
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
};
