import { Router } from 'express';
import type { WaStatus } from '@zk/shared';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../http/errors.js';import { getWhatsAppStatus as getWhatsAppState,
  initializeWhatsAppService,
  disconnectWhatsAppService,
  logoutWhatsAppService,
  sendTextMessage,
  getWhatsAppStatus,
} from '../services/whatsapp.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/wa/status — current WhatsApp connection state
// ---------------------------------------------------------------------------

router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const state = getWhatsAppState();
    res.json({
      status: state.status as WaStatus,
      phoneNumber: state.phoneNumber,
      pushName: state.pushName,
      lastQrAt: state.lastQrAt?.toISOString() ?? null,
      lastConnectedAt: state.connected ? new Date().toISOString() : null,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/wa/qr — get current QR code (for initial render)
// ---------------------------------------------------------------------------

router.get(
  '/qr',
  asyncHandler(async (_req, res) => {
    const state = getWhatsAppState();
    res.json({
      qr: state.lastQr,
      generatedAt: state.lastQrAt?.toISOString() ?? null,
      available: !!state.lastQr,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/wa/connect — start WhatsApp connection
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  asyncHandler(async (req, res) => {
    // Check if already connected
    const state = getWhatsAppState();
    if (state.connected) {
      return res.json({ ok: true, message: 'Already connected', status: state.status });
    }

    // Check if connecting or reconnecting
    if (state.status === 'CONNECTING' || state.status === 'RECONNECTING' || state.status === 'QR_PENDING') {
      return res.json({ ok: true, message: 'Connection already in progress', status: state.status });
    }

    // Start the WhatsApp service
    await initializeWhatsAppService();

    const newState = getWhatsAppState();
    res.json({
      ok: true,
      message: 'Connecting... Scan the QR code to link',
      status: newState.status,
      qr: newState.lastQr,
      qrAvailable: !!newState.lastQr,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/wa/reconnect — attempt to reconnect
// ---------------------------------------------------------------------------

router.post(
  '/reconnect',
  asyncHandler(async (_req, res) => {
    const state = getWhatsAppState();

    if (state.connected) {
      return res.json({ ok: true, message: 'Already connected' });
    }

    // Reset reconnect attempts and try again
    await initializeWhatsAppService();

    const newState = getWhatsAppState();
    res.json({
      ok: true,
      message: 'Reconnecting...',
      status: newState.status,
      qr: newState.lastQr,
      qrAvailable: !!newState.lastQr,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/wa/logout — logout and disconnect
// ---------------------------------------------------------------------------

router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    await logoutWhatsAppService();

    const state = getWhatsAppState();
    res.json({
      ok: true,
      message: 'Logged out successfully',
      status: state.status,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/wa/disconnect — disconnect without logout
// ---------------------------------------------------------------------------

router.post(
  '/disconnect',
  asyncHandler(async (_req, res) => {
    await disconnectWhatsAppService();

    const state = getWhatsAppState();
    res.json({
      ok: true,
      message: 'Disconnected',
      status: state.status,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/wa/send — send a message
// ---------------------------------------------------------------------------

router.post(
  '/send',
  asyncHandler(async (req, res) => {
    const { chatJid, text, contactId } = req.body;

    if (!chatJid || !text) {
      return res.status(400).json({
        ok: false,
        error: 'chatJid and text are required',
      });
    }

    const result = await sendTextMessage(chatJid, text, contactId ?? undefined);

    if (result.success) {
      return res.json({
        ok: true,
        messageId: result.messageId,
        message: 'Message sent',
      });
    } else {
      return res.status(500).json({
        ok: false,
        error: result.error ?? 'Failed to send message',
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/wa/chats — list all chats/contacts
// ---------------------------------------------------------------------------

router.get(
  '/chats',
  asyncHandler(async (req, res) => {
    const contacts = await prisma.contact.findMany({
      where: {
        ownerId: 'owner',
        // Exclude system-generated contacts if any
      },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        waJid: true,
        name: true,
        pushName: true,
        isGroup: true,
        isWhitelisted: true,
        isBlacklisted: true,
        isExcluded: true,
        inboundCount: true,
        unreadCount: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        autopilotEnabled: true,
        needsHuman: true,
        tags: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    // Transform for client
    const chats = contacts.map(c => ({
      id: c.id,
      jid: c.waJid,
      name: c.name ?? c.pushName ?? c.waJid,
      phone: c.waJid.includes('@') ? c.waJid.split('@')[0] : c.waJid,
      isGroup: c.isGroup,
      unreadCount: c.unreadCount,
      needsHuman: c.needsHuman,
      autopilotEnabled: c.autopilotEnabled,
      isWhitelisted: c.isWhitelisted,
      isBlacklisted: c.isBlacklisted,
      isExcluded: c.isExcluded,
      tags: (c.tags as unknown as string[]) ?? [],
      lastMessagePreview: c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      messageCount: c._count.messages,
    }));

    res.json({ chats, total: chats.length });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/wa/chats/:id — get a specific chat's messages
// ---------------------------------------------------------------------------

router.get(
  '/chats/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get contact
    const contact = await prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        waJid: true,
        name: true,
        pushName: true,
        isGroup: true,
      },
    });

    if (!contact) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    // Get messages for this chat, most recent first
    const messages = await prisma.message.findMany({
      where: {
        contactId: id as string,
      },
      orderBy: { waTimestamp: 'desc' },
      take: 100,
      select: {
        id: true,
        chatJid: true,
        direction: true,
        author: true,
        kind: true,
        text: true,
        draftText: true,
        status: true,
        skipReason: true,
        createdAt: true,
        sentAt: true,
        skipReason: true,
      },
    });

    // Reverse to get chronological order
    const sortedMessages = [...messages].reverse().map(m => ({
      id: m.id,
      chatId: contact.id,
      direction: m.direction,
      author: m.author,
      kind: m.kind,
      text: m.text,
      draftText: m.draftText,
      transcript: null,
      status: m.status,
      skipReason: m.skipReason,
      handoffReason: null,
      confidence: null,
      createdAt: m.createdAt.toISOString(),
      sentAt: m.sentAt?.toISOString() ?? null,
    }));

    res.json({
      chat: {
        id: contact.id,
        jid: contact.waJid,
        name: contact.name ?? contact.pushName ?? contact.waJid,
        isGroup: contact.isGroup,
      },
      messages: sortedMessages,
      hasMore: messages.length >= 100,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/wa/chats/:id/read — mark messages as read
// ---------------------------------------------------------------------------

router.post(
  '/chats/:id/read',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const contact = await prisma.contact.findUnique({
      where: { id },
    });

    if (!contact) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    // Mark all messages as read and reset unread count
    await prisma.message.updateMany({
      where: {
        contactId: id as string,
        author: 'CUSTOMER',
        status: 'RECEIVED',
      },
      data: {
        status: 'SENT', // Mark as read
      },
    }).catch(() => {});

    await prisma.contact.update({
      where: { id },
      data: {
        unreadCount: 0,
      },
    }).catch(() => {});

    res.json({ ok: true, message: 'Marked as read' });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/wa/messages/:id/reply — send a reply to a specific message
// ---------------------------------------------------------------------------

router.post(
  '/messages/:id/reply',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ ok: false, error: 'text is required' });
    }

    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        contact: true,
      },
    });

    if (!message) {
      return res.status(404).json({ ok: false, error: 'Message not found' });
    }

    // Send the reply
    const result = await sendTextMessage(message.chatJid, text, message.contactId);

    if (result.success) {
      return res.json({
        ok: true,
        messageId: result.messageId,
        message: 'Reply sent',
      });
    } else {
      return res.status(500).json({
        ok: false,
        error: result.error ?? 'Failed to send reply',
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/wa/health — check if WhatsApp is available
// ---------------------------------------------------------------------------

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const state = getWhatsAppState();
    res.json({
      available: true,
      connected: state.connected,
      status: state.status,
      phoneNumber: state.phoneNumber,
    });
  }),
);

export default router;
