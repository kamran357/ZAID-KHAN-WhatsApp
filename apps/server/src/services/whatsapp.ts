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

  // baileys types are incomplete - these exist at runtime
  const chatId = (chat as unknown as { id: string }).id;
  const senderId = sender;
  const messageId = (message as unknown as { id: string }).id;

  try {
    // Get or create contact
    let contact = await prisma.contact.upsert({
      where: { waJid: chatId },
      update: {
        name: pushName ?? null,
        pushName: pushName ?? null,
        inboundCount: { increment: 1 },
        lastMessageAt: new Date(),
        lastMessagePreview: extractText(message) ?? null,
        unreadCount: { increment: 1 },
      },
      create: {
        waJid: chatId,
        name: pushName ?? null,
        pushName: pushName ?? null,
        isGroup,
        inboundCount: 1,
        lastMessageAt: new Date(),
        lastMessagePreview: extractText(message) ?? null,
        unreadCount: 1,
      },
    });

    // Get message text
    const body = extractText(message);
    const isText = !!body;

    // Determine message kind
    let kind: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'STICKER' | 'REACTION' | 'OTHER' = 'OTHER';
    const msgType = getMessageType(message);

    if (msgType === 'messageText') kind = 'TEXT';
    else if (msgType === 'messageAudio') kind = 'AUDIO';
    else if (msgType === 'messageImage') kind = 'IMAGE';
    else if (msgType === 'messageDocument') kind = 'DOCUMENT';
    else if (msgType === 'messageSticker') kind = 'STICKER';
    else if (msgType === 'messageReaction') kind = 'REACTION';
    else if (isText) kind = 'TEXT';

    // Message timestamp
    const waTimestamp = extractTimestamp(message);

    // Get or create message (avoid duplicates)
    const existing = await prisma.message.findUnique({
      where: { waMessageId: messageId },
    });

    if (existing) {
      await prisma.message.update({
        where: { waMessageId: messageId },
        data: {
          waTimestamp: new Date(waTimestamp),
          createdAt: new Date(),
        },
      }).catch(() => {});
      return;
    }

    // Create message record
    await prisma.message.create({
      data: {
        waMessageId: messageId,
        contactId: chatId,
        chatJid: chatId,
        direction: message.key.fromMe ? 'OUTBOUND' : 'INBOUND',
        author: message.key.fromMe ? 'HUMAN' : 'CUSTOMER',
        kind,
        text: body,
        draftText: null,
        status: 'RECEIVED',
        waTimestamp: new Date(waTimestamp),
        createdAt: new Date(),
        // baileys types don't include key.t but it exists at runtime
        sentAt: (message.key as { t?: number }).t ? new Date((message.key as { t?: number }).t as number) : null,
      },
    }).catch((error) => {
      log.error('wa/ingest-create', { error: error instanceof Error ? error.message : 'unknown' });
    });
    // Update contact
    await prisma.contact.update({
      where: { waJid: chatId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: body ?? null,
        unreadCount: { increment: 1 },
      },
    }).catch(() => {});

    log.info('wa/ingest', {
      messageId,
      chatId,
      direction: message.key.fromMe ? 'OUTBOUND' : 'INBOUND',
      kind,
      textPreview: body ? body.slice(0, 50) : null,
    });
  } catch (error) {
    log.error('wa/ingest-error', {
      error: error instanceof Error ? error.message : 'unknown',
      messageId,
    });
  }
}

// Helper functions for baileys type compatibility

function extractText(message: WAMessage): string | null {
  try {
    // baileys message structure: message.message?.['text']?.['body']
    const msg = message.message as Record<string, unknown>;
    const textMsg = msg['text'] as Record<string, unknown> | undefined;
    return textMsg?.['body'] as string | undefined ?? null;
  } catch {
    return null;
  }
}

function getMessageType(message: WAMessage): string | undefined {
  try {
    const msg = message.message as Record<string, unknown>;
    return msg['@type'] as string | undefined;
  } catch {
    return undefined;
  }
}

function extractTimestamp(message: WAMessage): Date | number {
  try {
    const msg = message.message as Record<string, unknown>;
    const serialized = msg['_serialized'] as Record<string, unknown> | undefined;
    if (serialized?.['timestamp']) {
      return serialized['timestamp'] as number;
    }
    if (msg['timestamp']) {
      return msg['timestamp'] as number;
    }
    return Date.now();
  } catch {
    return Date.now();
  }
}

// ---------------------------------------------------------------------------
// Socket event emitter
// ---------------------------------------------------------------------------

import { Server } from 'socket.io';
import type { ServerToClientEvents } from '../../../../packages/shared/dist/events.js';

let io: Server<ServerToClientEvents, ServerToClientEvents> | null = null;

export function setSocketIO(server: Server<ServerToClientEvents, ServerToClientEvents>): void {
  io = server;
}

export function emitWaStatus(state: WhatsAppAdapterState): void {
  if (!io) return;
  // Map WhatsAppAdapterState to WaStatusPayload
  const payload: import('../../../../packages/shared/dist/dto.js').WaStatusPayload = {
    status: state.status as import('../../../../packages/shared/dist/enums.js').WaStatus,
    phoneNumber: state.phoneNumber,
    pushName: state.pushName,
    lastDisconnectCode: null,
  };
  io.emit('wa:status', payload);
}

export function emitWaQr(qr: string | null, generatedAt: Date | null): void {
  if (!io) return;
  io.emit('wa:qr', {
    qr,
    generatedAt: generatedAt ? generatedAt.toISOString() : null,
    available: !!qr,
  });
}

export function emitMessageNew(message: { id: string; chatId: string; direction: 'INBOUND' | 'OUTBOUND'; author: 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM'; kind: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'STICKER' | 'REACTION' | 'OTHER'; text: string | null; draftText: string | null; status: 'RECEIVED' | 'SKIPPED' | 'DRAFTED' | 'APPROVED' | 'REJECTED' | 'SENDING' | 'SENT' | 'FAILED' | 'AI_RATE_LIMITED'; createdAt: string; sentAt: string | null }, contact: { id: string; waJid: string; name: string; isGroup: boolean; lastMessagePreview: string | null; lastMessageAt: string | null }, unreadCount: number): void {
  if (!io) return;
  io.emit('wa:message:new', { message, contact, unreadCount });
}

export function emitMessageSent(messageId: string, status: string): void {
  if (!io) return;
  io.emit('wa:message:sent', { messageId, status });
}

export function emitMessageFailed(messageId: string, error: string): void {
  if (!io) return;
  io.emit('wa:message:failed', { messageId, error });
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

export function setupMessageHandler(): void {
  setMessageHandler(async (message, chat, sender, isGroup, pushName) => {
    await ingestMessage(message, chat, sender, isGroup, pushName);

    // Emit socket event for new message
    const chatId = (chat as unknown as { id: string }).id;
    const messageId = (message as unknown as { id: string }).id;
    const body = extractText(message);

    emitMessageNew(
      {
        id: messageId,
        chatId,
        direction: message.key.fromMe ? 'OUTBOUND' : 'INBOUND',
        author: message.key.fromMe ? 'HUMAN' : 'CUSTOMER',
        kind: 'TEXT',
        text: body,
        draftText: null,
        status: 'RECEIVED',
        createdAt: new Date().toISOString(),
        sentAt: (message.key as { t?: number }).t ? new Date((message.key as { t?: number }).t as number).toISOString() : null,
      },
      {
        id: chatId,
        waJid: chatId,
        name: pushName ?? chatId,
        isGroup,
        lastMessagePreview: body,
        lastMessageAt: new Date().toISOString(),
      },
      1
    );
  });
}

export async function sendReply(
  prisma: PrismaClient,
  chatId: string,
  text: string,
  messageId: string | null
): Promise<void> {
  const result = await sendMessage(prisma, chatId, text);

  if (result.success) {
    emitMessageSent(messageId || `sent-${Date.now()}`, 'SENT');
  } else {
    emitMessageFailed(messageId || `sent-${Date.now()}`, result.error || 'Failed to send');
  }
}
