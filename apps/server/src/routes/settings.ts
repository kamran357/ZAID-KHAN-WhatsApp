import { Router } from 'express';
import { z } from 'zod';
import {
  AUTOPILOT_MODES,
  BUDGET_POLICIES,
  DEFAULT_AI_MODEL,
  DEFAULT_FALLBACK_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
  FAST_AI_MODEL,
  type AiModelsResponse,
  type ModelInfo,
} from '@zk/shared';
import { asyncHandler, HttpError } from '../http/errors.js';
import {
  clearGroqKey,
  getGroqKey,
  getSettingsDto,
  storeGroqKey,
  updateSettings,
} from '../services/settings.js';
import { broadcastUsage, groq, recordModelUsage } from '../ai/runtime.js';
import { GroqError } from '../ai/groq.js';
import { recordAiUsage } from '../services/usage.js';
import { emit } from '../socket/emitter.js';

const router = Router();

const patchSchema = z
  .object({
    aiModel: z.string().min(1).max(120),
    fallbackModel: z.string().min(1).max(120).nullable(),
    transcriptionModel: z.string().min(1).max(120),
    autopilotMode: z.enum(AUTOPILOT_MODES),
    businessName: z.string().min(1).max(120),
    persona: z.string().max(2000).nullable(),
    workingHoursEnabled: z.boolean(),
    workingDays: z.array(z.number().int().min(0).max(6)).max(7),
    workingStart: z.string().regex(/^\d{2}:\d{2}$/),
    workingEnd: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().min(1).max(64),
    outOfHoursMessage: z.string().max(1000).nullable(),
    replyDelayMinSec: z.number().int().min(1).max(120),
    replyDelayMaxSec: z.number().int().min(1).max(300),
    dailyReplyLimit: z.number().int().min(1).max(5000),
    maxConsecutiveAi: z.number().int().min(1).max(10),
    sendTypingPresence: z.boolean(),
    confidenceThreshold: z.number().min(0).max(1),
    maxOutputTokens: z.number().int().min(50).max(4000),
    skipTrivialMessages: z.boolean(),
    cacheReuseEnabled: z.boolean(),
    dailyRequestBudget: z.number().int().min(10).max(100_000),
    dailyTokenBudget: z.number().int().min(1000).max(20_000_000),
    budgetPolicy: z.enum(BUDGET_POLICIES),
    outOfLimitAutoReply: z.boolean(),
  })
  .partial();

/** Static list used when no key is configured yet, so Settings is never empty. */
function staticModels(): ModelInfo[] {
  const ids: { id: string; audio: boolean }[] = [
    { id: DEFAULT_AI_MODEL, audio: false },
    { id: FAST_AI_MODEL, audio: false },
    { id: 'llama-3.3-70b-versatile', audio: false },
    { id: 'llama-3.1-8b-instant', audio: false },
    { id: DEFAULT_TRANSCRIPTION_MODEL, audio: true },
    { id: 'whisper-large-v3', audio: true },
  ];
  return ids.map((entry) => ({ ...entry, ownedBy: null, contextWindow: null }));
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettingsDto());
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid settings', 'invalid_body', parsed.error.flatten());
    }
    const dto = await updateSettings(parsed.data);
    emit('settings:updated', { settings: dto });
    await broadcastUsage();
    res.json(dto);
  }),
);

const keySchema = z.object({ apiKey: z.string().min(20).max(200) });

router.put(
  '/groq-key',
  asyncHandler(async (req, res) => {
    const parsed = keySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'A valid API key is required', 'invalid_body');
    const dto = await storeGroqKey(parsed.data.apiKey);
    emit('settings:updated', { settings: dto });
    res.json({ groqKeyConfigured: dto.groqKeyConfigured, groqKeyLast4: dto.groqKeyLast4 });
  }),
);

router.delete(
  '/groq-key',
  asyncHandler(async (_req, res) => {
    const dto = await clearGroqKey();
    emit('settings:updated', { settings: dto });
    res.json({ groqKeyConfigured: dto.groqKeyConfigured, groqKeyLast4: dto.groqKeyLast4 });
  }),
);

/** Model picker is driven by the key's real entitlements, never a hardcoded list. */
router.get(
  '/ai/models',
  asyncHandler(async (_req, res) => {
    const settings = await getSettingsDto();
    const apiKey = await getGroqKey();
    const fetchedAt = new Date().toISOString();

    if (!apiKey) {
      const payload: AiModelsResponse = {
        models: staticModels(),
        selected: settings.aiModel || DEFAULT_AI_MODEL,
        fallback: settings.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
        source: 'static',
        fetchedAt,
        warning: 'Add a Groq API key to load the models your account can use.',
      };
      res.json(payload);
      return;
    }

    try {
      const { models, warning } = await groq.listModels(apiKey);
      if (models.length === 0) {
        res.json({
          models: staticModels(),
          selected: settings.aiModel,
          fallback: settings.fallbackModel,
          source: 'static',
          fetchedAt,
          warning: warning ?? 'Groq returned no models for this key.',
        } satisfies AiModelsResponse);
        return;
      }
      res.json({
        models,
        selected: settings.aiModel,
        fallback: settings.fallbackModel,
        source: 'groq',
        fetchedAt,
        ...(warning ? { warning } : {}),
      } satisfies AiModelsResponse);
    } catch (error) {
      const message =
        error instanceof GroqError && error.kind === 'auth'
          ? 'Groq rejected the saved key. Update it in Settings.'
          : 'Could not load models from Groq.';
      res.json({
        models: staticModels(),
        selected: settings.aiModel,
        fallback: settings.fallbackModel,
        source: 'static',
        fetchedAt,
        warning: message,
      } satisfies AiModelsResponse);
    }
  }),
);

/** Cheap round-trip probe: 1 short prompt, no customer data involved. */
router.post(
  '/ai/test',
  asyncHandler(async (_req, res) => {
    const apiKey = await getGroqKey();
    if (!apiKey) throw new HttpError(400, 'Add a Groq API key first', 'no_key');
    const settings = await getSettingsDto();
    const started = Date.now();

    try {
      const result = await groq.chat({
        apiKey,
        model: settings.aiModel,
        fallbackModel: settings.fallbackModel,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        maxTokens: 12,
      });
      await recordModelUsage({
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        timeZone: settings.timezone,
      });
      res.json({
        ok: true,
        model: result.model,
        usedFallback: result.usedFallback,
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      const kind = error instanceof GroqError ? error.kind : 'network';
      // A failed probe still belongs in the usage counters (errors + rateLimitHits).
      await recordAiUsage({ model: settings.aiModel, error: true, timeZone: settings.timezone }).catch(
        () => undefined,
      );
      await broadcastUsage();
      res.status(502).json({
        ok: false,
        kind,
        message:
          kind === 'rate_limited'
            ? 'Groq is rate limiting this key right now. Retries are automatic.'
            : kind === 'auth'
              ? 'Groq rejected the saved key.'
              : 'Could not complete the AI test call.',
      });
    }
  }),
);

export default router;
