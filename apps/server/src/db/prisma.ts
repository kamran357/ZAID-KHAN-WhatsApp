import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { log } from '../logging.js';

export function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const target = url.slice('file:'.length);
  if (target === ':memory:' || isAbsolute(target)) return url;
  const absolute = resolve(process.cwd(), target);
  mkdirSync(dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

let prismaClient: PrismaClient | null = null;
let adapter: PrismaLibSql | null = null;

function getAdapter(): PrismaLibSql {
  if (!adapter) {
    const rawUrl = process.env.DATABASE_URL;
    if (rawUrl == null || rawUrl === '') {
      throw new Error(`DATABASE_URL is not set (cwd=${process.cwd()})`);
    }
    const resolvedUrl = resolveDatabaseUrl(rawUrl);
    log.info('db/getAdapter', { rawUrl, resolvedUrl, cwd: process.cwd() });
    adapter = new PrismaLibSql({ url: resolvedUrl });
    log.info('db/getAdapter', { adapterCreated: true, adapterName: adapter.adapterName, adapterProvider: adapter.provider });
  }
  return adapter;
}

function getPrisma(): PrismaClient {
  if (!prismaClient) {
    log.info('db/getPrisma', { adapterConstructor: getAdapter().constructor.name });
    prismaClient = new PrismaClient({ adapter: getAdapter() });
    log.info('db/getPrisma', { prismaClientCreated: true });
  }
  return prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    if (!prismaClient) {
      prismaClient = getPrisma();
    }
    return (prismaClient as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    log.error('db/check-failed', { error });
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaClient) await prismaClient.$disconnect();
}
