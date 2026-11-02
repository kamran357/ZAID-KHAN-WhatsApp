import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import makeWASocket, { DisconnectReason } from 'baileys';
import type { ConnectionState, WAMessage, Chat } from 'baileys';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { log } from '../logging.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BAILEYS_DATA_DIR = 'data/baileys';
const CREDS_FILE = 'credentials.json';

// Random 4-12s delay to avoid ban (anti-detection)
function randomDelay(minSec = 4, maxSec = 12): number {
  return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
}

// Minimal pino-like logger for baileys
function createBaileysLogger() {
  return {
    level: 'silent',
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => createBaileysLogger(),
  } as never;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppAdapterState {
  connected: boolean;
  phoneNumber: string | null;
  pushName: string | null;
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING' | 'CONNECTED' | 'RECONNECTING' | 'LOGGED_OUT' | 'ERROR';
  lastQr: string | null;
  lastQrAt: Date | null;
}

export type MessageHandler = (
  message: WAMessage,
  chat: Chat,
  sender: string,
  isGroup: boolean,
  pushName: string | null
) => Promise<void>;

// ---------------------------------------------------------------------------
// Baileys Service
// ---------------------------------------------------------------------------

let socket: ReturnType<typeof makeWASocket> | null = null;
let currentState: WhatsAppAdapterState = {
  connected: false,
  phoneNumber: null,
  pushName: null,
  status: 'DISCONNECTED',
  lastQr: null,
  lastQrAt: null,
};
let messageHandler: MessageHandler | null = null;
let reconnectAttempt = 0;
let isIntentionalDisconnect = false;
let pendingRestart: Promise<void> | null = null;
let shouldStart = false;

export function getWhatsAppState(): WhatsAppAdapterState {
  return { ...currentState };
}

export async function setMessageHandler(handler: MessageHandler | null): Promise<void> {
  messageHandler = handler;
}

function updateState(partial: Partial<WhatsAppAdapterState>): void {
  currentState = { ...currentState, ...partial };
  log.info('wa/state', { status: currentState.status, phoneNumber: currentState.phoneNumber, pushName: currentState.pushName });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Serialize / restore session
// ---------------------------------------------------------------------------

async function saveCredentials(sock: ReturnType<typeof makeWASocket>): Promise<void> {
  try {
    // Try to dump credentials, but baileys socket may not have this method in all versions
    const dumpMethod = (sock as unknown as { dump?: () => Promise<unknown> }).dump;
    if (dumpMethod) {
      const dump = await dumpMethod();
      const dir = resolve(BAILEYS_DATA_DIR);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(resolve(dir, CREDS_FILE), JSON.stringify(dump, null, 2));
      log.info('wa/creds', { saved: true, path: resolve(dir, CREDS_FILE) });
    } else {
      log.info('wa/creds', { saved: false, reason: 'socket does not support dump' });
    }
  } catch (error) {
    log.error('wa/creds-save', { error: error instanceof Error ? error.message : 'unknown' });
  }
}

async function loadCredentials(): Promise<unknown | null> {
  try {
    const path = resolve(BAILEYS_DATA_DIR, CREDS_FILE);
    if (!existsSync(path)) {
      log.info('wa/creds', { loaded: false, reason: 'file not found' });
      return null;
    }
    const raw = readFileSync(path, 'utf-8');
    const creds = JSON.parse(raw);
    log.info('wa/creds', { loaded: true, path });
    return creds;
  } catch (error) {
    log.error('wa/creds-load', { error: error instanceof Error ? error.message : 'unknown' });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Baileys initialization
// ---------------------------------------------------------------------------

export async function startWhatsApp(
  prisma: PrismaClient,
  onStateChange?: (state: WhatsAppAdapterState) => void
): Promise<void> {
  if (socket) {
    log.warn('wa/start', { error: 'already running' });
    return;
  }

  if (pendingRestart) {
    await pendingRestart;
    return;
  }

  isIntentionalDisconnect = false;
  shouldStart = true;
  updateState({ status: 'CONNECTING' });
  onStateChange?.(getWhatsAppState());

  // Delayed start: random 4-12s to avoid automated-ban pattern
  const delaySec = randomDelay();
  log.info('wa/start', { delaySec, reason: 'anti-ban random delay' });
  await sleep(delaySec * 1000);

  if (!shouldStart) return;

  try {
    const creds = await loadCredentials();

    // Create the socket with minimal config
    // When starting fresh, baileys needs at least an auth state with creds.me
    // The socket will generate new credentials on first connection
    // Use empty auth state if no saved credentials, baileys will create new ones
    const authState: Record<string, unknown> = (creds && typeof creds === 'object' && creds !== null) ? creds as Record<string, unknown> : {};
    
    // Ensure we have at least an empty creds structure
    if (!authState.creds) {
      authState.creds = {};
    }
    // Ensure creds.me exists (even if empty)
    if (!authState.creds.me) {
      authState.creds.me = {} as never;
    }
    
    socket = makeWASocket({
      auth: authState as never,
      logger: createBaileysLogger(),
    });

    // --- Connection events ---

    socket.ev.on('connection.update', (conn: Partial<ConnectionState>) => {
      void (async () => {
        log.info('wa/connection', { state: conn.connection, hasQr: !!conn.qr });

      if (conn.qr) {
        // QR code available for scanning
        updateState({
          status: 'QR_PENDING',
          lastQr: conn.qr,
          lastQrAt: new Date(),
          connected: false,
          phoneNumber: null,
        });
        onStateChange?.(getWhatsAppState());
        // Save QR to DB
        prisma.whatsAppSession.updateMany({
          where: { ownerId: 'owner' },
          data: {
            status: 'QR_PENDING',
            lastQrAt: new Date(),
            lastConnectedAt: null,
            phoneNumber: null,
          },
        }).catch(() => {});
      }

      if (conn.connection === 'open') {
        log.info('wa/ready', {});
        reconnectAttempt = 0;
        updateState({
          status: 'CONNECTED',
          connected: true,
        });
        onStateChange?.(getWhatsAppState());

        // Update DB
        prisma.whatsAppSession.updateMany({
          where: { ownerId: 'owner' },
          data: {
            status: 'CONNECTED',
            lastConnectedAt: new Date(),
          },
        }).catch(() => {});

        // Get our profile info (delay slightly to allow connection to stabilize)
        setTimeout(async () => {
          try {
            const me = await (socket as unknown as { getProfileInfo: () => Promise<{ name?: string }> }).getProfileInfo();
            const myNumber = await (socket as unknown as { getNumber: () => Promise<string | undefined> }).getNumber();
            if (myNumber) {
              updateState({
                phoneNumber: myNumber,
                pushName: me?.name ?? null,
                status: 'CONNECTED',
              });

              await prisma.whatsAppSession.updateMany({
                where: { ownerId: 'owner' },
                data: {
                  phoneNumber: myNumber,
                  pushName: me?.name ?? null,
                  status: 'CONNECTED',
                  lastConnectedAt: new Date(),
                },
              }).catch(() => {});
              onStateChange?.(getWhatsAppState());
            }
          } catch (error) {
            log.info('wa/profile', { error: error instanceof Error ? error.message : 'unknown' });
          }
        }, 2000);

        // Save credentials after successful connection
        await saveCredentials(socket);
      }

      if (conn.connection === 'close') {
        log.info('wa/disconnected', { reason: conn.lastDisconnect?.date });
        await handleDisconnect(prisma, onStateChange, conn.lastDisconnect);
      }
    })();
    });

    // TODO: The baileys types are complex, so we're using type assertions throughout.
    // The runtime should work correctly even if TypeScript complains.

    // --- Message handling ---

    socket.ev.on('messages.upsert', ({ messages }: { messages: WAMessage[]; type: string }) => {
      (async () => {
        for (const msg of messages) {
          try {
            if (!socket || !shouldStart) continue;

            const chatId = (msg.key as { remoteJid?: string }).remoteJid;
            if (!chatId) continue;

            const isGroup = !msg.key.fromMe && chatId.endsWith('@g.us');

            // Get chat to check if group
            let chat: Chat | undefined;
            try {
              chat = await (socket as unknown as { getChat: (jid: string) => Promise<Chat | undefined> }).getChat(chatId);
            } catch {
              // Chat might not exist yet
            }

            const actualIsGroup = chat?.isGroup ?? isGroup;
            const senderPhone = chatId;
            const senderName = msg.pushName ?? senderPhone;

            log.info('wa/inbound', {
              messageId: msg.id,
              from: senderPhone,
              isGroup: actualIsGroup,
            });

            // Call the message handler (ingest to DB, etc.)
            if (messageHandler) {
              await messageHandler(
                msg,
                chat ?? { id: chatId, isGroup: actualIsGroup } as Chat,
                senderPhone,
                actualIsGroup,
                senderName
              );
            }
          } catch (error) {
            log.error('wa/message-handle', {
              error: error instanceof Error ? error.message : 'unknown',
              messageId: msg.id,
            });
          }
        }
      })();
    });

    log.info('wa/connecting', {});
    // Socket connects automatically when created with proper config

  } catch (error) {
    log.error('wa/start-error', {
      error: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined,
    });
    updateState({ status: 'ERROR' });
    onStateChange?.(getWhatsAppState());
    handleDisconnect(prisma, onStateChange, undefined);
  }
}

// ---------------------------------------------------------------------------
// Message sending
// ---------------------------------------------------------------------------

export async function sendMessage(
  prisma: PrismaClient,
  chatId: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  if (!socket || !shouldStart) {
    return { success: false, error: 'WhatsApp not connected' };
  }

  try {
    // Anti-ban: random delay before sending
    const delayMs = randomDelay(4, 12) * 1000;
    log.info('wa/send', { delayMs, chatId });
    await sleep(delayMs);

    // Send typing indicator before sending
    try {
      await (socket as unknown as { sendPresenceUpdate: (type: string, jid: string) => Promise<void> }).sendPresenceUpdate('composing', chatId);
      // Typing indicator for 2-3 seconds
      await sleep(2500);
    } catch {
      // Ignore typing errors
    }

    // Send the message
    const msg = await (socket as unknown as { sendText: (jid: string, text: string) => Promise<{ id?: string } | undefined> }).sendText(chatId, text);

    log.info('wa/sent', {
      messageId: msg?.id ?? 'unknown',
      chatId,
      text: text.slice(0, 100),
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    log.error('wa/send-error', { error: message, chatId });

    // Check for specific error codes
    if (message.includes('410') || message.includes('LOGGED_OUT') || message.includes('logged out')) {
      handleDisconnect(prisma, undefined, undefined);
    }

    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Disconnect / Logout
// ---------------------------------------------------------------------------

export async function disconnectWhatsApp(
  prisma: PrismaClient,
  onStateChange?: (state: WhatsAppAdapterState) => void
): Promise<void> {
  isIntentionalDisconnect = true;
  shouldStart = false;
  log.info('wa/disconnect', { intentional: true });

  if (socket) {
    try {
      await (socket as unknown as { logout: () => Promise<void> }).logout();
    } catch {
      // Ignore logout errors
    }
    socket = null;
  }

  // Clean up credentials
  try {
    const credsPath = resolve(BAILEYS_DATA_DIR, CREDS_FILE);
    if (existsSync(credsPath)) {
      rmSync(credsPath);
      log.info('wa/creds', { deleted: true });
    }
  } catch {
    // Ignore cleanup errors
  }

  updateState({
    status: 'DISCONNECTED',
    connected: false,
    phoneNumber: null,
    pushName: null,
    lastQr: null,
    lastQrAt: null,
  });

  prisma.whatsAppSession.updateMany({
    where: { ownerId: 'owner' },
    data: {
      status: 'DISCONNECTED',
      phoneNumber: null,
      pushName: null,
      lastConnectedAt: null,
    },
  }).catch(() => {});

  onStateChange?.(getWhatsAppState());
}

export async function logoutWhatsApp(
  prisma: PrismaClient,
  onStateChange?: (state: WhatsAppAdapterState) => void
): Promise<void> {
  log.info('wa/logout', {});
  await disconnectWhatsApp(prisma, onStateChange);
}

// ---------------------------------------------------------------------------
// Reconnect with backoff
// ---------------------------------------------------------------------------

async function handleDisconnect(
  prisma: PrismaClient,
  onStateChange?: (state: WhatsAppAdapterState) => void,
  lastDisconnect?: { error?: unknown; date?: Date }
): Promise<void> {
  if (socket) {
    try {
      await saveCredentials(socket);
    } catch {
      // Ignore
    }
    socket = null;
  }

  if (isIntentionalDisconnect || !shouldStart) {
    updateState({ status: 'DISCONNECTED', connected: false });
    onStateChange?.(getWhatsAppState());
    return;
  }

  // Determine if we should reconnect
  const errorCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
  const shouldReconnect = reconnectAttempt < 5 && errorCode !== DisconnectReason.loggedOut && errorCode !== DisconnectReason.badSession;

  if (!shouldReconnect) {
    log.warn('wa/reconnect', { attempts: reconnectAttempt, errorCode, givingUp: true });
    updateState({ status: 'LOGGED_OUT', connected: false });
    prisma.whatsAppSession.updateMany({
      where: { ownerId: 'owner' },
      data: { status: 'LOGGED_OUT' },
    }).catch(() => {});
    onStateChange?.(getWhatsAppState());
    return;
  }

  // Exponential backoff: 2^attempt seconds, capped at 60s
  const backoffSec = Math.min(2 ** reconnectAttempt, 60);
  reconnectAttempt++;

  log.info('wa/reconnect', {
    attempt: reconnectAttempt,
    backoffSec,
    reason: 'connection lost, scheduling reconnect',
  });

  updateState({ status: 'RECONNECTING', connected: false });
  onStateChange?.(getWhatsAppState());

  await sleep(backoffSec * 1000);

  log.info('wa/reconnect', { attempt: reconnectAttempt, action: 'restarting' });
  // Restart by creating a new promise
  pendingRestart = startWhatsApp(prisma, onStateChange);
  await pendingRestart;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function decodeJid(jid: string): { phone?: string; pushName?: string; isGroup?: boolean } | null {
  try {
    const [local, domain] = jid.split('@');
    if (!local || !domain) return null;

    const isGroup = domain === 'g.us';

    let phone = local;
    if (phone.startsWith('+')) {
      phone = phone.slice(1);
    }
    phone = phone.replace(/[^0-9]/g, '');

    return { phone, isGroup };
  } catch {
    return null;
  }
}
