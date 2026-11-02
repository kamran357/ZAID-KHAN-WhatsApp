import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env.js';

const VERSION = 'v1';
const SALT = 'zk-settings-key-v1';

/**
 * The Groq key is encrypted at rest with AES-256-GCM. The wrapping key comes from
 * APP_ENCRYPTION_KEY (32 bytes base64, or any passphrase), and falls back to a
 * scrypt derivation of AUTH_PASSWORD so local setups work without extra config.
 */
function wrappingKey(): Buffer {
  const configured = env.APP_ENCRYPTION_KEY?.trim();
  if (configured) {
    const raw = Buffer.from(configured, 'base64');
    if (raw.length === 32) return raw;
    return scryptSync(configured, SALT, 32);
  }
  return scryptSync(env.AUTH_PASSWORD, SALT, 32);
}

let cached: Buffer | null = null;
function key(): Buffer {
  cached ??= wrappingKey();
  return cached;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
    ':',
  );
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Unreadable secret payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function last4(value: string): string {
  return value.slice(-4);
}
