import { Router } from 'express';
import { z } from 'zod';
import { env, isProd } from '../config/env.js';
import { asyncHandler, HttpError } from '../http/errors.js';
import { loginRateLimit, requireAuth, sessionCookieOptions } from '../http/auth.js';
import { safeEqual } from '../services/crypto.js';
import { createSession, destroySession, parseCookies, SESSION_COOKIE } from '../services/sessions.js';
import { getSettingsRow } from '../services/settings.js';

const router = Router();

const loginSchema = z.object({ password: z.string().min(1).max(200) });

router.post(
  '/login',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Password is required', 'invalid_body');

    if (!safeEqual(parsed.data.password, env.AUTH_PASSWORD)) {
      throw new HttpError(401, 'Incorrect password', 'invalid_credentials');
    }

    const { token, expiresAt } = await createSession(req.get('user-agent'));
    res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions, expires: expiresAt });
    res.json({ ok: true, expiresAt: expiresAt.toISOString() });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const settings = await getSettingsRow();
    res.json({ authenticated: true, name: settings.businessName, environment: env.NODE_ENV });
  }),
);

/** Public liveness probe used by the login page and PM2 health checks. */
router.get('/health', (_req, res) => {
  res.json({ ok: true, secured: isProd });
});

export default router;
