import type {
  AiLimitEvent,
  AiUsageSnapshot,
  NotificationDTO,
  SettingsDTO,
  ToastPayload,
  WaStatusPayload,
} from './dto.js';

/**
 * Socket.IO contract. Both apps import these maps, so a renamed event or a
 * changed payload is a type error instead of a silent runtime mismatch.
 */
export interface ServerToClientEvents {
  'wa:status': (payload: WaStatusPayload) => void;
  'wa:qr': (payload: { qr: string | null; generatedAt: string | null; available: boolean }) => void;
  'wa:message:new': (payload: { message: { id: string; chatId: string; direction: 'INBOUND' | 'OUTBOUND'; author: 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM'; kind: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'STICKER' | 'REACTION' | 'OTHER'; text: string | null; draftText: string | null; status: 'RECEIVED' | 'SKIPPED' | 'DRAFTED' | 'APPROVED' | 'REJECTED' | 'SENDING' | 'SENT' | 'FAILED' | 'AI_RATE_LIMITED'; createdAt: string; sentAt: string | null }; contact: { id: string; waJid: string; name: string; isGroup: boolean; lastMessagePreview: string | null; lastMessageAt: string | null }; unreadCount: number }) => void;
  'wa:message:sent': (payload: { messageId: string; status: string }) => void;
  'wa:message:failed': (payload: { messageId: string; error: string }) => void;
  'wa:state': (payload: { connected: boolean; phoneNumber: string | null; pushName: string | null; status: string; lastQr: string | null; lastQrAt: Date | null }) => void;
  'ai:usage': (payload: AiUsageSnapshot) => void;
  'ai:limit': (payload: AiLimitEvent) => void;
  'notification:new': (payload: { notification: NotificationDTO }) => void;
  'settings:updated': (payload: { settings: SettingsDTO }) => void;
  'toast': (payload: ToastPayload) => void;
}

export interface ClientToServerEvents {
  'ping:app': (ack?: (at: number) => void) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  authenticated: boolean;
}

export const SOCKET_EVENTS = {
  waStatus: 'wa:status',
  waQr: 'wa:qr',
  waMessageNew: 'wa:message:new',
  waMessageSent: 'wa:message:sent',
  waMessageFailed: 'wa:message:failed',
  waState: 'wa:state',
  aiUsage: 'ai:usage',
  aiLimit: 'ai:limit',
  notificationNew: 'notification:new',
  settingsUpdated: 'settings:updated',
  toast: 'toast',
  pingApp: 'ping:app',
} as const;
