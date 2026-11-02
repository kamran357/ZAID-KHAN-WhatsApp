import express from 'express';
import cookieParser from 'cookie-parser';
import type { HealthResponse } from '@zk/shared';
import { asyncHandler, errorHandler, notFoundHandler } from './http/errors.js';
import { requireAuth } from './http/auth.js';
import { checkDatabase } from './db/prisma.js';
import { getSettingsRow } from './services/settings.js';
import { prisma } from './db/prisma.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import analyticsRoutes from './routes/analytics.js';
import waRoutes from './routes/wa.js';
import notificationRoutes from './routes/notifications.js';
import devRoutes from './routes/dev.js';

const VERSION = '0.1.0';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());

  // Public: used by the login screen and by PM2/uptime checks. No secrets, no data.
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const [dbOk, session] = await Promise.all([
        checkDatabase(),
        prisma.whatsAppSession.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null),
      ]);
      const body: HealthResponse = {
        ok: dbOk,
        version: VERSION,
        db: dbOk ? 'ok' : 'error',
        wa: (session?.status ?? 'DISCONNECTED') as HealthResponse['wa'],
        aiConfigured: Boolean((await getSettingsRow().catch(() => null))?.groqApiKeyEnc),
      };
      res.status(dbOk ? 200 : 503).json(body);
    }),
  );

  app.use('/api/auth', authRoutes);

  // Everything below requires a valid session cookie.
  app.use('/api', requireAuth);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/wa', waRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/dev', devRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
