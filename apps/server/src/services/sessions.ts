import { SESSION_COOKIE } from '@zk/shared';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { randomToken, sha256 } from './crypto.js';

export interface SessionInfo {
  token: string;
  expiresAt: Date;
}

export async function createSession(userAgent?: string): Promise<SessionInfo> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.appSession.create({
    data: { tokenHash: sha256(token), userAgent: userAgent?.slice(0, 200) ?? null, expiresAt },
  });
  return { token, expiresAt };
}

export async function findValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.appSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.appSession.delete({ where: { id: row.id } }).catch(() => undefined);
    return false;
  }
  return true;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.appSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export { SESSION_COOKIE };
