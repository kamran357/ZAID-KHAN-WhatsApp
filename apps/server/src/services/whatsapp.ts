import { log } from '../logging.js';
import type { WAMessage, Chat } from 'baileys';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  getWhatsAppState,
  setMessageHandler,
  startWhatsApp,
  disconnectWhatsApp,
  logoutWhatsApp,
  sendMessage,
  type WhatsAppAdapterState,
} from './baileys.js';

// ---------------------------------------------------------------------------
// Message ingestion
// ---------------------------------------------------------------------------

let prisma: PrismaClient | null = null;

export function setPrismaClient(client: PrismaClient): void {
  prisma = client;
}

export async function ingestMessage(
  message: WAMessage,
  chat: Chat,
  sender: string,
  isGroup: boolean,
  pushName: string | null
): Promise<void> {
  if (!prisma) {
    log.error('wa/ingest', { error: 'prisma client not set' });
    return;
  }

  const chatId = chat.id;
  const senderId = sender;

  try {
    // Get or create contact
    let contact = await prisma.contact.upsert({
      where: { waJid: chatId },
      update: {
        name: pushName ?? null,
        pushName: pushName ?? null,
        inboundCount: { increment: 1 },
        lastMessageAt: new Date(),
        lastMessagePreview: message.message?.['text']?.['body']?.slice(0, 100) ?? null,
        unreadCount: { increment: 1 },
      },
      create: {
        waJid: chatId,
        name: pushName ?? null,
        pushName: pushName ?? null,
        isGroup,
        inboundCount: 1,
        lastMessageAt: new Date(),
        lastMessagePreview: message.message?.['text']?.['body']?.slice(0, 100) ?? null,
        unreadCount: 1,
      },
    });

    // Get message text
    const body = message.message?.['text']?.['body'] ?? null;
    const isText = !!body;

    // Determine message kind
    let kind: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'STICKER' | 'REACTION' | 'OTHER' = 'OTHER';
    const msgType = (message.message as { [key: string]: unknown })?.['@type'];

    if (msgType === 'messageText') kind = 'TEXT';
    else if (msgType === 'messageAudio') kind = 'AUDIO';
    else if (msgType === 'messageImage') kind = 'IMAGE';
    else if (msgType === 'messageDocument') kind = 'DOCUMENT';
    else if (msgType === 'messageSticker') kind = 'STICKER';
    else if (msgType === 'messageReaction') kind = 'REACTION';
    else if (isText) kind = 'TEXT';

    // Message timestamp
    const waTimestamp = message.message?.['_serialized']?.['timestamp'] ??
                        message.message?.['timestamp'] ??
                        new Date();

    // Get or create message (avoid duplicates)
    const existing = await prisma.message.findUnique({
      where: { waMessageId: message.id },
    });

    if (existing) {
      await prisma.message.update({
        where: { waMessageId: message.id },
        data: {
          waTimestamp: new Date(waTimestamp),
          createdAt: new Date(),
        },
      }).catch(() => {});
      return;
    }

    // Create message record
    const newMessage = await prisma.message.create({
      data: {
        waMessageId: message.id,
        contactId: contact.id,
        chatJid: chatId,
        direction: 'INBOUND',
        author: 'CUSTOMER',
        kind,
        text: body,
        status: 'RECEIVED',
        waTimestamp: new Date(waTimestamp),
      },
    });

    log.info('wa/ingest', {
      messageId: message.id,
      contactId: contact.id,
      kind,
      hasText: !!body,
    });

    // Emit socket event for live update
    const { emit } = await import('../socket/emitter.js');
    emit('wa:message:new', {
      message: {
        id: newMessage.id,
        chatId: chatId,
        contactId: contact.id,
        direction: 'INBOUND' as const,
        author: 'CUSTOMER' as const,
        kind,
        text: body,
        status: 'RECEIVED' as const,
        createdAt: newMessage.createdAt.toISOString(),
        sentAt: null,
      },
      contact: {
        id: contact.id,
        waJid: chatId,
        name: contact.name,
        pushName: contact.pushName,
        isGroup,
        unreadCount: contact.unreadCount,
        lastMessagePreview: contact.lastMessagePreview,
        lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      },
      unreadCount: contact.unreadCount,
    });

  } catch (error) {
    log.error('wa/ingest-error', {
      error: error instanceof Error ? error.message : 'unknown',
      messageId: message.id,
    });
  }
}

// ---------------------------------------------------------------------------
// Message sending with status tracking
// ---------------------------------------------------------------------------

export async function sendTextMessage(
  chatJid: string,
  text: string,
  contactId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!prisma) {
    return { success: false, error: 'prisma client not set' };
  }

  try {
    const pendingMessage = await prisma.message.create({
      data: {
        waMessageId: `pending-${Date.now()}`,
        contactId,
        chatJid,
        direction: 'OUTBOUND',
        author: 'HUMAN',
        kind: 'TEXT',
        text,
        status: 'SENDING',
        waTimestamp: new Date(),
      },
    });

    const result = await sendMessage(prisma, chatJid, text, null);

    if (result.success) {
      await prisma.message.update({
        where: { id: pendingMessage.id },
        data: {
          status: 'SENT',
        },
      }).catch(() => {});

      const { emit } = await import('../socket/emitter.js');
      emit('wa:message:sent', {
        messageId: pendingMessage.id,
        status: 'SENT',
      });

      log.info('wa/send-success', { messageId: pendingMessage.id, chatJid });
      return { success: true, messageId: pendingMessage.id };
    } else {
      await prisma.message.update({
        where: { id: pendingMessage.id },
        data: {
          status: 'FAILED',
        },
      }).catch(() => {});

      const { emit } = await import('../socket/emitter.js');
      emit('wa:message:failed', {
        messageId: pendingMessage.id,
        error: result.error,
      });

      log.error('wa/send-failed', { messageId: pendingMessage.id, error: result.error });
      return { success: false, error: result.error };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    log.error('wa/send-error', { error: message, chatJid });

    await prisma.message.updateMany({
      where: {
        chatJid,
        text,
        status: 'SENDING',
      },
      data: { status: 'FAILED' },
    }).catch(() => {});

    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// WhatsApp service initialization
// ---------------------------------------------------------------------------

let onStateChangeHandler: ((state: WhatsAppAdapterState) => void) | null = null;

export function setOnStateChange(handler: (state: WhatsAppAdapterState) => void): void {
  onStateChangeHandler = handler;
}

export async function initializeWhatsAppService(): Promise<void> {
  if (!prisma) {
    log.error('wa/init', { error: 'prisma client not set' });
    return;
  }

  await setMessageHandler(async (message, chat, sender, isGroup, pushName) => {
    await ingestMessage(message, chat, sender, isGroup, pushName);
  });

  setOnStateChange(async (state) => {
    if (prisma) {
      await prisma.whatsAppSession.updateMany({
        where: { ownerId: 'owner' },
        data: {
          status: state.status,
          phoneNumber: state.phoneNumber,
          pushName: state.pushName,
          lastQrAt: state.lastQrAt,
          lastConnectedAt: state.connected ? new Date() : null,
        },
      }).catch(() => {});

      const { emit } = await import('../socket/emitter.js');
      emit('wa:status', {
        status: state.status,
        phoneNumber: state.phoneNumber,
        pushName: state.pushName,
        lastDisconnectCode: null as number | null,
      });

      if (state.lastQr) {
        emit('wa:qr', {
          qr: state.lastQr,
          imageDataUrl: null as string | null,
          generatedAt: state.lastQrAt?.toISOString() ?? null,
          available: true,
        });
      }
    }
  });

  await startWhatsApp(prisma, onStateChangeHandler);
}

export async function disconnectWhatsAppService(): Promise<void> {
  await disconnectWhatsApp(prisma!, onStateChangeHandler);
}

export async function logoutWhatsAppService(): Promise<void> {
  await logoutWhatsApp(prisma!, onStateChangeHandler);
}

export function getWhatsAppStatus(): WhatsAppAdapterState {
  return getWhatsAppState();
}
