import { Router } from 'express';
import type { WaStatus } from '@zk/shared';
import { prisma } from '../db/prisma.js';
import { asyncHandler, HttpError } from '../http/errors.js';

const router = Router();

router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const session = await prisma.whatsAppSession.findFirst({ orderBy: { createdAt: 'desc' } });
    res.json({
      status: (session?.status ?? 'DISCONNECTED') as WaStatus,
      phoneNumber: session?.phoneNumber ?? null,
      pushName: session?.pushName ?? null,
      lastQrAt: session?.lastQrAt?.toISOString() ?? null,
      lastConnectedAt: session?.lastConnectedAt?.toISOString() ?? null,
    });
  }),
);

/**
 * Linking is implemented in phase 2 (Baileys session manager). These endpoints
 * exist now so the dashboard's Connect screen has a stable contract, and fail
 * loudly instead of pretending to connect.
 */
router.get(
  '/qr',
  asyncHandler(async (_req, res) => {
    res.json({ qr: null, imageDataUrl: null, generatedAt: null, available: false });
  }),
);

for (const path of ['/connect', '/reconnect', '/logout', '/pairing-code'] as const) {
  router.post(
    path,
    asyncHandler(async () => {
      throw new HttpError(
        501,
        'WhatsApp linking is not implemented yet — it arrives in phase 2.',
        'not_implemented',
      );
    }),
  );
}

export default router;
