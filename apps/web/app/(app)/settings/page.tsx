'use client';

import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Save, Sparkles, Trash2, Zap } from 'lucide-react';
import type { AiModelsResponse, BudgetPolicy, SettingsDTO, SettingsPatch } from '@zk/shared';
import { CardHeader, GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Input, PasswordInput } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { Chip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/toast';
import { apiGet, apiSend } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { formatCompact, formatNumber } from '@/lib/format';

const MODES: { id: SettingsDTO['autopilotMode']; label: string; hint: string }[] = [
  { id: 'OFF', label: 'Off', hint: 'Never reply automatically' },
  { id: 'APPROVAL', label: 'Approval', hint: 'Draft, you send' },
  { id: 'FULL_AUTO', label: 'Full auto', hint: 'Send after delay' },
];

const POLICIES: { id: BudgetPolicy; label: string; hint: string }[] = [
  { id: 'PAUSE_AI', label: 'Pause AI', hint: 'Stop calling Groq, tag Needs human' },
  { id: 'DRAFT_ONLY', label: 'Draft only', hint: 'Keep drafting, stop auto-sending' },
];

export default function SettingsPage() {
  const toast = useToast();
  const settings = useApi<SettingsDTO>('/api/settings');
  const [form, setForm] = useState<SettingsDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [models, setModels] = useState<AiModelsResponse | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);

  const loadModels = async () => {
    setModelsBusy(true);
    try {
      setModels(await apiGet<AiModelsResponse>('/api/settings/ai/models'));
    } catch (error) {
      toast.push({
        level: 'error',
        title: 'Could not load models',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setModelsBusy(false);
    }
  };

  useEffect(() => {
    if (form?.groqKeyConfigured && !models) void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.groqKeyConfigured]);

  const chatModels = useMemo(
    () => (models?.models ?? []).filter((model) => !model.audio),
    [models],
  );
  const audioModels = useMemo(
    () => (models?.models ?? []).filter((model) => model.audio),
    [models],
  );

  const patch = <K extends keyof SettingsPatch>(key: K, value: SettingsPatch[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload: SettingsPatch = {
        aiModel: form.aiModel,
        fallbackModel: form.fallbackModel,
        transcriptionModel: form.transcriptionModel,
        autopilotMode: form.autopilotMode,
        businessName: form.businessName,
        persona: form.persona,
        workingHoursEnabled: form.workingHoursEnabled,
        workingDays: form.workingDays,
        workingStart: form.workingStart,
        workingEnd: form.workingEnd,
        timezone: form.timezone,
        outOfHoursMessage: form.outOfHoursMessage,
        replyDelayMinSec: form.replyDelayMinSec,
        replyDelayMaxSec: form.replyDelayMaxSec,
        dailyReplyLimit: form.dailyReplyLimit,
        maxConsecutiveAi: form.maxConsecutiveAi,
        sendTypingPresence: form.sendTypingPresence,
        confidenceThreshold: form.confidenceThreshold,
        maxOutputTokens: form.maxOutputTokens,
        skipTrivialMessages: form.skipTrivialMessages,
        cacheReuseEnabled: form.cacheReuseEnabled,
        dailyRequestBudget: form.dailyRequestBudget,
        dailyTokenBudget: form.dailyTokenBudget,
        budgetPolicy: form.budgetPolicy,
        outOfLimitAutoReply: form.outOfLimitAutoReply,
      };
      const updated = await apiSend<SettingsDTO>('/api/settings', 'PUT', payload);
      setForm(updated);
      toast.push({ level: 'success', title: 'Settings saved' });
    } catch (error) {
      toast.push({
        level: 'error',
        title: 'Could not save settings',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const saveKey = async () => {
    setKeyBusy(true);
    try {
      await apiSend('/api/settings/groq-key', 'PUT', { apiKey: keyInput });
      setKeyInput('');
      toast.push({ level: 'success', title: 'Groq key saved', message: 'Encrypted at rest, never sent back to the browser.' });
      settings.refresh();
      await loadModels();
    } catch (error) {
      toast.push({
        level: 'error',
        title: 'Could not save the key',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setKeyBusy(false);
    }
  };

  const deleteKey = async () => {
    setKeyBusy(true);
    try {
      await apiSend('/api/settings/groq-key', 'DELETE');
      toast.push({ level: 'warn', title: 'Groq key removed' });
      settings.refresh();
      setModels(null);
    } finally {
      setKeyBusy(false);
    }
  };

  const testAi = async () => {
    setTesting(true);
    try {
      const result = await apiSend<{ ok: boolean; model: string; latencyMs: number; usedFallback: boolean }>(
        '/api/settings/ai/test',
        'POST',
      );
      toast.push({
        level: 'success',
        title: 'Groq replied',
        message: `${result.model} · ${result.latencyMs} ms${result.usedFallback ? ' · fallback model' : ''}`,
      });
    } catch (error) {
      toast.push({
        level: 'error',
        title: 'AI test failed',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setTesting(false);
    }
  };

  const simulate429 = async () => {
    try {
      await apiSend('/api/dev/simulate/rate-limit', 'POST', { failures: 2 });
      toast.push({
        level: 'warn',
        title: '429 armed',
        message: 'The next 2 Groq calls will be rejected. Run the AI test to watch retry + fallback.',
      });
    } catch (error) {
      toast.push({
        level: 'error',
        title: 'Simulator unavailable',
        message: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (!form) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded-full bg-white/70" />
        <div className="h-64 animate-pulse rounded-panel bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">Settings</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Model, budget and safety limits. The Groq key is stored encrypted and never returned.
          </p>
        </div>
        <Button variant="navy" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" aria-hidden />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <GlassCard>
        <CardHeader
          title="Groq connection"
          subtitle="Models are loaded from your key's real entitlements"
          action={
            <Chip tone={form.groqKeyConfigured ? 'green' : 'red'} dot>
              {form.groqKeyConfigured ? `Saved …${form.groqKeyLast4 ?? ''}` : 'No key'}
            </Chip>
          }
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <PasswordInput
            label="Groq API key"
            placeholder="gsk_…"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            hint="Stored with AES-256-GCM in SQLite. Only the last 4 characters are ever shown."
          />
          <div className="flex gap-2">
            <Button variant="blue" onClick={saveKey} disabled={keyBusy || keyInput.length < 20}>
              <KeyRound className="h-4 w-4" aria-hidden />
              Save key
            </Button>
            {form.groqKeyConfigured ? (
              <Button variant="outline" onClick={deleteKey} disabled={keyBusy}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Remove
              </Button>
            ) : null}
            <Button variant="ghost" onClick={testAi} disabled={testing || !form.groqKeyConfigured}>
              <Sparkles className="h-4 w-4" aria-hidden />
              {testing ? 'Testing…' : 'Test'}
            </Button>
          </div>
        </div>

        {models?.warning ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
            {models.warning}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SearchableSelect
            label="Primary model"
            value={form.aiModel}
            options={chatModels.map((model) => ({
              value: model.id,
              label: model.id,
              hint: model.contextWindow ? `${formatCompact(model.contextWindow)} ctx` : undefined,
            }))}
            onChange={(value) => patch('aiModel', value)}
            hint={modelsBusy ? 'Loading models…' : `${chatModels.length} chat models available`}
            disabled={modelsBusy}
          />
          <SearchableSelect
            label="Fallback model (optional)"
            value={form.fallbackModel ?? ''}
            options={[
              { value: '', label: 'No fallback' },
              ...chatModels.map((model) => ({ value: model.id, label: model.id })),
            ]}
            onChange={(value) => patch('fallbackModel', value === '' ? null : value)}
            hint="Tried once when the primary model is rate limited"
            disabled={modelsBusy}
          />
          <SearchableSelect
            label="Voice-note transcription model"
            value={form.transcriptionModel}
            options={
              audioModels.length > 0
                ? audioModels.map((model) => ({ value: model.id, label: model.id }))
                : [{ value: form.transcriptionModel, label: form.transcriptionModel }]
            }
            onChange={(value) => patch('transcriptionModel', value)}
            disabled={modelsBusy}
          />
          <Input
            label="Business name"
            value={form.businessName}
            onChange={(event) => patch('businessName', event.target.value)}
          />
        </div>
      </GlassCard>

      <GlassCard>
        <CardHeader
          title="Daily AI budget"
          subtitle="Your own soft limit, independent of Groq's window"
          action={
            <Chip tone={form.budgetPolicy === 'PAUSE_AI' ? 'blue' : 'purple'}>
              {form.budgetPolicy === 'PAUSE_AI' ? 'Pause at 100%' : 'Draft only at 100%'}
            </Chip>
          }
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Input
            label="Requests per day"
            type="number"
            min={10}
            value={form.dailyRequestBudget}
            onChange={(event) => patch('dailyRequestBudget', Number(event.target.value))}
            hint={`${formatNumber(form.dailyRequestBudget)} calls`}
          />
          <Input
            label="Tokens per day"
            type="number"
            min={1000}
            step={1000}
            value={form.dailyTokenBudget}
            onChange={(event) => patch('dailyTokenBudget', Number(event.target.value))}
            hint={`${formatCompact(form.dailyTokenBudget)} tokens`}
          />
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-navy">At 100% budget</span>
            <div className="flex gap-1.5 rounded-full bg-white/60 p-1">
              {POLICIES.map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  onClick={() => patch('budgetPolicy', policy.id)}
                  aria-pressed={form.budgetPolicy === policy.id}
                  className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition ${
                    form.budgetPolicy === policy.id
                      ? 'bg-navy text-white'
                      : 'text-ink-muted hover:bg-white'
                  }`}
                  title={policy.hint}
                >
                  {policy.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">
              {POLICIES.find((policy) => policy.id === form.budgetPolicy)?.hint}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-white/70 pt-4 sm:grid-cols-2">
          <Toggle
            label="Out-of-limit courtesy reply"
            description="Send “we received your message” at most once per chat every 6 hours when the limit is hit."
            checked={form.outOfLimitAutoReply}
            onChange={(value) => patch('outOfLimitAutoReply', value)}
          />
          <Toggle
            label="Skip trivial messages"
            description="Ignore “ok”, “thanks”, 👍 and similar, so the free tier is spent on real questions."
            checked={form.skipTrivialMessages}
            onChange={(value) => patch('skipTrivialMessages', value)}
          />
          <Toggle
            label="Reuse cached answers"
            description="Answer a repeated question from cache instead of calling the model."
            checked={form.cacheReuseEnabled}
            onChange={(value) => patch('cacheReuseEnabled', value)}
          />
          <Input
            label="Max reply tokens"
            type="number"
            min={50}
            max={4000}
            value={form.maxOutputTokens}
            onChange={(event) => patch('maxOutputTokens', Number(event.target.value))}
            hint="Caps the length (and cost) of every reply"
          />
        </div>
      </GlassCard>

      <GlassCard>
        <CardHeader title="Autopilot" subtitle="Default is Approval — nothing sends without you" />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => patch('autopilotMode', mode.id)}
              aria-pressed={form.autopilotMode === mode.id}
              className={`rounded-2xl border p-3 text-left transition ${
                form.autopilotMode === mode.id
                  ? 'border-brand bg-brand/10 shadow-[0_10px_24px_-18px_rgba(59,142,240,0.9)]'
                  : 'border-white/80 bg-white/55 hover:border-brand/40'
              }`}
            >
              <span className="flex items-center justify-between text-sm font-semibold text-navy">
                {mode.label}
                {form.autopilotMode === mode.id ? (
                  <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-muted">{mode.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Reply delay min (s)"
            type="number"
            min={1}
            max={120}
            value={form.replyDelayMinSec}
            onChange={(event) => patch('replyDelayMinSec', Number(event.target.value))}
          />
          <Input
            label="Reply delay max (s)"
            type="number"
            min={1}
            max={300}
            value={form.replyDelayMaxSec}
            onChange={(event) => patch('replyDelayMaxSec', Number(event.target.value))}
          />
          <Input
            label="Daily reply cap"
            type="number"
            min={1}
            max={5000}
            value={form.dailyReplyLimit}
            onChange={(event) => patch('dailyReplyLimit', Number(event.target.value))}
            hint="Hard stop, independent of AI budget"
          />
          <Input
            label="Max consecutive AI replies"
            type="number"
            min={1}
            max={10}
            value={form.maxConsecutiveAi}
            onChange={(event) => patch('maxConsecutiveAi', Number(event.target.value))}
            hint="Then hand off to you"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Confidence threshold"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.confidenceThreshold}
            onChange={(event) => patch('confidenceThreshold', Number(event.target.value))}
            hint="Below this the chat is tagged Needs human"
          />
          <Toggle
            label="Typing presence"
            description="Show “typing…” while the delayed reply is being sent."
            checked={form.sendTypingPresence}
            onChange={(value) => patch('sendTypingPresence', value)}
          />
        </div>
      </GlassCard>

      <GlassCard>
        <CardHeader title="Working hours" subtitle="Outside these hours only the courtesy reply is sent" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Toggle
            label="Enable working hours"
            description="When off, autopilot is always available."
            checked={form.workingHoursEnabled}
            onChange={(value) => patch('workingHoursEnabled', value)}
          />
          <Input
            label="Timezone"
            value={form.timezone}
            onChange={(event) => patch('timezone', event.target.value)}
            hint="IANA name, e.g. Asia/Karachi"
          />
          <Input
            label="Start"
            type="time"
            value={form.workingStart}
            onChange={(event) => patch('workingStart', event.target.value)}
          />
          <Input
            label="End"
            type="time"
            value={form.workingEnd}
            onChange={(event) => patch('workingEnd', event.target.value)}
          />
        </div>
        <div className="mt-4">
          <label className="block text-xs font-semibold text-navy" htmlFor="ooh">
            Out-of-hours message
          </label>
          <textarea
            id="ooh"
            rows={2}
            value={form.outOfHoursMessage ?? ''}
            onChange={(event) => patch('outOfHoursMessage', event.target.value || null)}
            placeholder="Thanks for messaging! We reply between 9am and 9pm."
            className="mt-1.5 w-full rounded-2xl border border-line bg-white/78 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
      </GlassCard>

      <GlassCard>
        <CardHeader
          title="Developer tools"
          subtitle="Only available outside production"
          action={<Chip tone="purple">dev</Chip>}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={simulate429}>
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Simulate 429 on next 2 calls
          </Button>
          <p className="text-[11px] text-ink-muted">
            Then press <span className="font-semibold text-navy">Test</span> above: you should see the
            retry, then the fallback model.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
