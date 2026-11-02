import type { AutopilotMode, BudgetPolicy, SettingsDTO, SettingsPatch } from '@zk/shared';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { decryptSecret, encryptSecret, last4 } from './crypto.js';

const SINGLETON = 'singleton';

/**
 * Structural shape of the settings row. Declared locally so the service does not
 * depend on the generated Prisma types (they are regenerated on every migrate).
 */
export interface SettingsRowShape {
  aiModel: string;
  fallbackModel: string | null;
  transcriptionModel: string;
  autopilotMode: string;
  businessName: string;
  persona: string | null;
  workingHoursEnabled: boolean;
  workingDays: unknown;
  workingStart: string;
  workingEnd: string;
  timezone: string;
  outOfHoursMessage: string | null;
  replyDelayMinSec: number;
  replyDelayMaxSec: number;
  dailyReplyLimit: number;
  maxConsecutiveAi: number;
  sendTypingPresence: boolean;
  confidenceThreshold: number;
  maxOutputTokens: number;
  skipTrivialMessages: boolean;
  cacheReuseEnabled: boolean;
  dailyRequestBudget: number;
  dailyTokenBudget: number;
  budgetPolicy: string;
  outOfLimitAutoReply: boolean;
  groqApiKeyEnc: string | null;
  groqApiKeyLast4: string | null;
  updatedAt: Date;
}

export async function getSettingsRow(): Promise<SettingsRowShape> {
  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON } });
  if (existing) return existing as SettingsRowShape;
  const created = await prisma.settings.create({ data: { id: SINGLETON } });
  return created as SettingsRowShape;
}

function workingDaysOf(value: unknown): number[] {
  if (Array.isArray(value)) {
    const days = value.filter((entry): entry is number => typeof entry === 'number');
    if (days.length > 0) return days;
  }
  return [1, 2, 3, 4, 5, 6];
}

export function toSettingsDto(row: SettingsRowShape): SettingsDTO {
  return {
    aiModel: row.aiModel,
    fallbackModel: row.fallbackModel,
    transcriptionModel: row.transcriptionModel,
    autopilotMode: row.autopilotMode as AutopilotMode,
    businessName: row.businessName,
    persona: row.persona,
    workingHoursEnabled: row.workingHoursEnabled,
    workingDays: workingDaysOf(row.workingDays),
    workingStart: row.workingStart,
    workingEnd: row.workingEnd,
    timezone: row.timezone,
    outOfHoursMessage: row.outOfHoursMessage,
    replyDelayMinSec: row.replyDelayMinSec,
    replyDelayMaxSec: row.replyDelayMaxSec,
    dailyReplyLimit: row.dailyReplyLimit,
    maxConsecutiveAi: row.maxConsecutiveAi,
    sendTypingPresence: row.sendTypingPresence,
    confidenceThreshold: row.confidenceThreshold,
    maxOutputTokens: row.maxOutputTokens,
    skipTrivialMessages: row.skipTrivialMessages,
    cacheReuseEnabled: row.cacheReuseEnabled,
    dailyRequestBudget: row.dailyRequestBudget,
    dailyTokenBudget: row.dailyTokenBudget,
    budgetPolicy: row.budgetPolicy as BudgetPolicy,
    outOfLimitAutoReply: row.outOfLimitAutoReply,
    groqKeyConfigured: Boolean(row.groqApiKeyEnc),
    groqKeyLast4: row.groqApiKeyLast4,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSettingsDto(): Promise<SettingsDTO> {
  return toSettingsDto(await getSettingsRow());
}

export async function updateSettings(patch: SettingsPatch): Promise<SettingsDTO> {
  await getSettingsRow();
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'workingDays') {
      data.workingDays = JSON.stringify(value);
      continue;
    }
    data[key] = value;
  }
  if (Object.keys(data).length === 0) return getSettingsDto();
  const updated = await prisma.settings.update({ where: { id: SINGLETON }, data });
  return toSettingsDto(updated as SettingsRowShape);
}

export async function storeGroqKey(apiKey: string): Promise<SettingsDTO> {
  await getSettingsRow();
  const trimmed = apiKey.trim();
  const updated = await prisma.settings.update({
    where: { id: SINGLETON },
    data: { groqApiKeyEnc: encryptSecret(trimmed), groqApiKeyLast4: last4(trimmed) },
  });
  return toSettingsDto(updated as SettingsRowShape);
}

export async function clearGroqKey(): Promise<SettingsDTO> {
  await getSettingsRow();
  const updated = await prisma.settings.update({
    where: { id: SINGLETON },
    // Kept as null so `groqKeyConfigured` flips to false; the secret is unrecoverable.
    data: { groqApiKeyEnc: null, groqApiKeyLast4: null },
  });
  return toSettingsDto(updated as SettingsRowShape);
}

/** The only place the plaintext key exists. Never return this to a client. */
export async function getGroqKey(): Promise<string | null> {
  const row = await getSettingsRow();
  if (row.groqApiKeyEnc) {
    try {
      return decryptSecret(row.groqApiKeyEnc);
    } catch {
      return null;
    }
  }
  return env.GROQ_API_KEY?.trim() || null;
}
