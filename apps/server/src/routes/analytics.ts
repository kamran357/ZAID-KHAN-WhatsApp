import { Router } from 'express';
import { z } from 'zod';
import type { AnalyticsSummary, DailyPoint, HandoffReason } from '@zk/shared';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../http/errors.js';
import { buildUsageSnapshot } from '../ai/runtime.js';
import { dateKey } from '../services/usage.js';
import { getSettingsRow } from '../services/settings.js';

const router = Router();

const rangeSchema = z.enum(['7d', '30d', '90d']).catch('7d');
const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

function dayList(days: number, timeZone: string): string[] {
  const out: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    out.push(dateKey(date, timeZone));
  }
  return out;
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const range = rangeSchema.parse(req.query.range ?? '7d');
    const settings = await getSettingsRow();
    const days = dayList(RANGE_DAYS[range] ?? 7, settings.timezone);

    const [stats, usageRows, handoffs, draftsPending, needsHuman, usage] = await Promise.all([
      prisma.dailyStat.findMany({ where: { date: { in: days } } }),
      prisma.aiUsage.findMany({ where: { date: { in: days } } }),
      prisma.handoffEvent.groupBy({
        by: ['reason'],
        _count: { _all: true },
        where: { createdAt: { gte: new Date(Date.now() - (RANGE_DAYS[range] ?? 7) * 86400000) } },
      }),
      prisma.message.count({ where: { status: 'DRAFTED' } }),
      prisma.contact.count({ where: { needsHuman: true } }),
      buildUsageSnapshot(),
    ]);

    const statByDay = new Map(stats.map((row) => [row.date, row]));
    const usageByDay = new Map<string, number>();
    for (const row of usageRows) {
      usageByDay.set(
        row.date,
        (usageByDay.get(row.date) ?? 0) + row.promptTokens + row.completionTokens,
      );
    }
    const requestsByDay = new Map<string, number>();
    for (const row of usageRows) {
      requestsByDay.set(row.date, (requestsByDay.get(row.date) ?? 0) + row.requests);
    }

    const series: DailyPoint[] = days.map((date) => {
      const stat = statByDay.get(date);
      return {
        date,
        inbound: stat?.inbound ?? 0,
        aiReplies: stat?.aiReplies ?? 0,
        humanReplies: stat?.humanReplies ?? 0,
        handoffs: stat?.handoffs ?? 0,
        aiRequests: requestsByDay.get(date) ?? 0,
        aiTokens: usageByDay.get(date) ?? 0,
      };
    });

    const totals = series.reduce(
      (acc, point) => ({
        inbound: acc.inbound + point.inbound,
        ai: acc.ai + point.aiReplies,
        human: acc.human + point.humanReplies,
        handoffs: acc.handoffs + point.handoffs,
        responseMs: acc.responseMs,
        responseCount: acc.responseCount,
      }),
      { inbound: 0, ai: 0, human: 0, handoffs: 0, responseMs: 0, responseCount: 0 },
    );
    for (const stat of stats) {
      totals.responseMs += stat.responseMsTotal;
      totals.responseCount += stat.responseCount;
    }

    const today = series[series.length - 1];
    const payload: AnalyticsSummary = {
      range,
      kpis: {
        aiRepliesToday: today?.aiReplies ?? 0,
        humanRepliesToday: today?.humanReplies ?? 0,
        inboundToday: today?.inbound ?? 0,
        draftsPending,
        needsHuman,
        avgResponseMs:
          totals.responseCount > 0 ? Math.round(totals.responseMs / totals.responseCount) : 0,
        handoffsToday: today?.handoffs ?? 0,
      },
      series,
      handoffReasons: handoffs
        .map((row) => ({ reason: row.reason as HandoffReason, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      usage,
    };
    res.json(payload);
  }),
);

export default router;
