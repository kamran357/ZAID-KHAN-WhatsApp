import {
  BUDGET_CRITICAL_PCT,
  BUDGET_WARN_PCT,
  type AiBudgetView,
  type BudgetPolicy,
  type UsageLevel,
} from '@zk/shared';

export interface BudgetInput {
  requests: number;
  tokens: number;
  maxRequests: number;
  maxTokens: number;
  policy: BudgetPolicy;
}

function pct(used: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.round((used / max) * 1000) / 10;
}

export function levelFor(pctValue: number): UsageLevel {
  if (pctValue >= 100) return 'exceeded';
  if (pctValue >= BUDGET_CRITICAL_PCT) return 'critical';
  if (pctValue >= BUDGET_WARN_PCT) return 'warn';
  return 'ok';
}

/** Budget state is derived, never stored, so it can never drift from the counters. */
export function computeBudgetView(input: BudgetInput): AiBudgetView {
  const requestPct = pct(input.requests, input.maxRequests);
  const tokenPct = pct(input.tokens, input.maxTokens);
  const worst = Math.max(requestPct, tokenPct);
  const level = levelFor(worst);
  return {
    maxRequests: input.maxRequests,
    maxTokens: input.maxTokens,
    requestPct,
    tokenPct,
    pct: worst,
    level,
    policy: input.policy,
    paused: level === 'exceeded' && input.policy === 'PAUSE_AI',
  };
}

/** True when the daily AI budget is spent and autopilot must not call Groq. */
export function isBudgetExhausted(view: AiBudgetView): boolean {
  return view.pct >= 100;
}

/**
 * What autopilot is allowed to do right now:
 *  - `full`      : call the model and deliver per mode
 *  - `draft_only`: budget spent but policy allows draft generation
 *  - `paused`    : no model calls at all (PAUSE_AI policy)
 */
export function budgetGate(view: AiBudgetView): 'full' | 'draft_only' | 'paused' {
  if (!isBudgetExhausted(view)) return 'full';
  return view.policy === 'DRAFT_ONLY' ? 'draft_only' : 'paused';
}

/** Crossing 85% should toast once per day, not on every request. */
export function shouldWarn(level: UsageLevel, alreadyWarned: boolean): boolean {
  return !alreadyWarned && (level === 'critical' || level === 'exceeded');
}
