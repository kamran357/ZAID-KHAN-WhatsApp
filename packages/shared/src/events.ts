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
  aiUsage: 'ai:usage',
  aiLimit: 'ai:limit',
  notificationNew: 'notification:new',
  settingsUpdated: 'settings:updated',
  toast: 'toast',
  pingApp: 'ping:app',
} as const;
