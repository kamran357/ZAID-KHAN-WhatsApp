import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client.js';
import { env } from '../config/env.js';
import { log } from '../logging.js';

/**
 * `file:./data/zaidkhan.db` is resolved against the server package directory, so
 * `npm run dev` and `npm run start` agree on where the database lives.
 * A non-`file:` URL (Postgres later) is passed through untouched.
 */
export function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const target = url.slice('file:'.length);
  if (target === ':memory:' || isAbsolute(target)) return url;
  const absolute = resolve(process.cwd(), target);
  mkdirSync(dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl(env.DATABASE_URL) });

export const prisma = new PrismaClient({ adapter });

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    log.error('db/check-failed', { error: error instanceof Error ? error.message : 'unknown' });
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
