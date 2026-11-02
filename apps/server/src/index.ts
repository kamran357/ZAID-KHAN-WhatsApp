import "dotenv/config";
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { SESSION_COOKIE, SOCKET_ROOM } from '@zk/shared';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { log } from './logging.js';
import { checkDatabase, disconnectDatabase } from './db/prisma.js';
import { setSocketServer } from './socket/emitter.js';
import { findValidSession, parseCookies } from './services/sessions.js';
import { broadcastUsage, retryQueue } from './ai/runtime.js';

const app = createApp();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  // Same-origin only: the dashboard reaches this through Next's rewrite proxy,
  // so no CORS exception is needed (and none is granted).
  serveClient: false,
  pingInterval: 20_000,
  pingTimeout: 25_000,
});

io.use(async (socket, next) => {
  try {
    const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    if (await findValidSession(token)) {
      socket.data.authenticated = true;
      next();
      return;
    }
    next(new Error('UNAUTHORIZED'));
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
});

io.on('connection', (socket) => {
  socket.join(SOCKET_ROOM);
  socket.on('ping:app', (ack?: (at: number) => void) => {
    if (typeof ack === 'function') ack(Date.now());
  });
  void broadcastUsage();
});

setSocketServer(io);

// Releases rate-limited work as soon as the window resets, without polling Groq.
const retryTicker = setInterval(() => {
  if (retryQueue.nextReleaseAt) void retryQueue.processDue();
}, 15_000);

const server = httpServer.listen(env.PORT, '0.0.0.0', async () => {
  const dbOk = await checkDatabase();
  log.info('server/started', {
    port: env.PORT,
    env: env.NODE_ENV,
    db: dbOk ? 'ok' : 'error',
    aiConfigured: Boolean(env.GROQ_API_KEY),
  });
});

function shutdown(signal: string): void {
  log.info('server/stopping', { signal });
  clearInterval(retryTicker);
  io.close();
  server.close(() => {
    void disconnectDatabase().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  log.error('server/unhandled-rejection', {
    error: reason instanceof Error ? reason.message : 'unknown',
  });
});
