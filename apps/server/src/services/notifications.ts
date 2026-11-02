import type { NotificationDTO, NotificationType } from '@zk/shared';
import { prisma } from '../db/prisma.js';
import { emit } from '../socket/emitter.js';
import { log } from '../logging.js';

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** Notifications are deduplicated so a burst of rate-limit hits does not spam the bell. */
export async function pushNotification(input: {
  type: NotificationType;
  title: string;
  body: string;
  contactId?: string | null;
  dedupeKey?: string;
}): Promise<NotificationDTO | null> {
  try {
    if (input.dedupeKey) {
      const recent = await prisma.notification.findFirst({
        where: {
          type: input.type,
          body: input.body,
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
      });
      if (recent) return null;
    }

    const created = await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        body: input.body,
        contactId: input.contactId ?? null,
      },
    });

    const dto: NotificationDTO = {
      id: created.id,
      type: created.type as NotificationType,
      title: created.title,
      body: created.body,
      contactId: created.contactId,
      read: created.read,
      createdAt: created.createdAt.toISOString(),
    };
    emit('notification:new', { notification: dto });
    return dto;
  } catch (error) {
    log.error('notifications/create-failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}
