import type { Server } from 'socket.io';
import { SOCKET_ROOM } from '@zk/shared';
import type { ServerToClientEvents } from '@zk/shared';

let io: Server | null = null;

export function setSocketServer(server: Server): void {
  io = server;
}

/** Single-operator dashboard: everything is broadcast to the owner room. */
export function emit<E extends keyof ServerToClientEvents>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  if (!io) return;
  (io.to(SOCKET_ROOM) as unknown as { emit: (name: string, ...rest: unknown[]) => void }).emit(
    event,
    ...args,
  );
}

export function connectedClients(): number {
  return io?.engine?.clientsCount ?? 0;
}
