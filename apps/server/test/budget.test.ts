import { describe, expect, it } from 'vitest';
import { budgetGate, computeBudgetView, isBudgetExhausted, shouldWarn } from '../src/ai/budget.js';

const base = { maxRequests: 100, maxTokens: 10_000, policy: 'PAUSE_AI' as const };

describe('budget view', () => {
  it('stays ok below 60%', () => {
    const view = computeBudgetView({ ...base, requests: 50, tokens: 5_000 });
    expect(view.level).toBe('ok');
    expect(view.paused).toBe(false);
    expect(budgetGate(view)).toBe('full');
  });

  it('warns at 60% and is critical at 85%', () => {
    expect(computeBudgetView({ ...base, requests: 60, tokens: 0 }).level).toBe('warn');
    const critical = computeBudgetView({ ...base, requests: 85, tokens: 0 });
    expect(critical.level).toBe('critical');
    expect(shouldWarn(critical.level, false)).toBe(true);
    expect(shouldWarn(critical.level, true)).toBe(false);
    expect(isBudgetExhausted(critical)).toBe(false);
  });

  it('uses the worse of the two dimensions', () => {
    const view = computeBudgetView({ ...base, requests: 5, tokens: 9_999 });
    expect(view.tokenPct).toBe(100);
    expect(view.level).toBe('exceeded');
  });

  it('pauses autopilot at 100% with the PAUSE_AI policy', () => {
    const view = computeBudgetView({ ...base, requests: 100, tokens: 0 });
    expect(view.level).toBe('exceeded');
    expect(view.paused).toBe(true);
    expect(budgetGate(view)).toBe('paused');
  });

  it('keeps drafting at 100% with the DRAFT_ONLY policy', () => {
    const view = computeBudgetView({ ...base, policy: 'DRAFT_ONLY', requests: 140, tokens: 0 });
    expect(view.paused).toBe(false);
    expect(budgetGate(view)).toBe('draft_only');
    expect(view.pct).toBeGreaterThan(100);
  });
});
