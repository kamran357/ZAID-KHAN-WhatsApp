import { Router } from 'express';
import { asyncHandler, HttpError } from '../http/errors.js';
import { prisma } from '../db/prisma.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        contactId: item.contactId,
        read: item.read,
        createdAt: item.createdAt.toISOString(),
      })),
      unread: items.filter((item) => !item.read).length,
    });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (_req, res) => {
    await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    // Express 5 types params as string | string[] (repeated segments).
    const id = String(req.params.id ?? '').trim();
    if (!id) throw new HttpError(400, 'Missing notification id', 'invalid_id');
    await prisma.notification.updateMany({ where: { id }, data: { read: true } });
    res.json({ ok: true });
  }),
);

export default router;
