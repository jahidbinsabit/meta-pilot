/**
 * AiCallLog daily rollup (audit R9, proposal N2).
 *
 * Raw `AiCallLog` rows are purged after 90 days by the cleanup cron, which
 * would permanently erase all AI cost/usage history. Before the purge runs,
 * the cron calls `rollupCompletedAiCallDays()` here: every completed
 * Asia/Dhaka day that still has raw rows is aggregated into one permanent
 * `AiCallDailyRollup` row. The aggregation is idempotent (full recompute +
 * upsert per day), so re-running it is always safe.
 *
 * Day semantics match `lib/generation-stats.ts`: the business day is
 * Asia/Dhaka (UTC+6 year-round, no DST), so a row belongs to Dhaka day D
 * when (createdAt + 6h) falls on D — equivalently, D spans the UTC window
 * [D 00:00 +06, D+1 00:00 +06) = [D-1 18:00Z, D 18:00Z).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BUSINESS_TIME_ZONE, dayKeyInTimeZone } from '@/lib/generation-stats';

const DAY_MS = 24 * 60 * 60 * 1000;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
// Discovery window: raw rows only exist for ~90 days (the purge), so
// looking back 100 days covers everything that can still be saved.
const DISCOVERY_WINDOW_DAYS = 100;

/** The AiCallLog fields the rollup aggregates (matches the findMany select). */
export interface AiCallRollupRow {
  provider: string;
  model: string;
  success: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
}

export interface AiCallGroupSummary {
  calls: number;
  totalTokens: number;
}

export interface AiCallDaySummary {
  calls: number;
  successes: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMsTotal: number;
  byProvider: Record<string, AiCallGroupSummary>;
  byModel: Record<string, AiCallGroupSummary>;
}

/** A row's effective token total: the recorded total, else prompt+completion. */
function effectiveTotalTokens(row: AiCallRollupRow): number {
  if (typeof row.totalTokens === 'number') return row.totalTokens;
  return (row.promptTokens ?? 0) + (row.completionTokens ?? 0);
}

function addToGroup(
  groups: Record<string, AiCallGroupSummary>,
  key: string,
  totalTokens: number,
): void {
  const group = groups[key] ?? { calls: 0, totalTokens: 0 };
  group.calls += 1;
  group.totalTokens += totalTokens;
  groups[key] = group;
}

/**
 * Pure aggregation of one day's AiCallLog rows into the rollup shape.
 * Exported separately from the DB code so it is unit-testable.
 */
export function summarizeAiCallRows(rows: AiCallRollupRow[]): AiCallDaySummary {
  const summary: AiCallDaySummary = {
    calls: 0,
    successes: 0,
    failures: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMsTotal: 0,
    byProvider: {},
    byModel: {},
  };

  for (const row of rows) {
    const totalTokens = effectiveTotalTokens(row);
    summary.calls += 1;
    if (row.success) summary.successes += 1;
    else summary.failures += 1;
    summary.promptTokens += row.promptTokens ?? 0;
    summary.completionTokens += row.completionTokens ?? 0;
    summary.totalTokens += totalTokens;
    summary.latencyMsTotal += row.latencyMs;
    addToGroup(summary.byProvider, row.provider, totalTokens);
    addToGroup(summary.byModel, row.model, totalTokens);
  }

  return summary;
}

/** UTC instant at which Dhaka day `dayKey` ('YYYY-MM-DD') starts. */
function dhakaDayStartUtc(dayKey: string): Date {
  return new Date(Date.parse(`${dayKey}T00:00:00.000Z`) - DHAKA_OFFSET_MS);
}

/**
 * Recompute one Dhaka day's rollup from its live AiCallLog rows and upsert
 * it. Returns the number of raw rows aggregated.
 */
export async function rollupAiCallDay(dayKey: string): Promise<number> {
  const start = dhakaDayStartUtc(dayKey);
  const end = new Date(start.getTime() + DAY_MS);
  const rows = await prisma.aiCallLog.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: {
      provider: true,
      model: true,
      success: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      latencyMs: true,
    },
  });

  const summary = summarizeAiCallRows(rows);
  const data = {
    calls: summary.calls,
    successes: summary.successes,
    failures: summary.failures,
    promptTokens: summary.promptTokens,
    completionTokens: summary.completionTokens,
    totalTokens: summary.totalTokens,
    latencyMsTotal: summary.latencyMsTotal,
    byProvider: summary.byProvider as unknown as Prisma.InputJsonValue,
    byModel: summary.byModel as unknown as Prisma.InputJsonValue,
  };
  await prisma.aiCallDailyRollup.upsert({
    where: { day: dayKey },
    create: { day: dayKey, ...data },
    update: data,
  });
  return summary.calls;
}

/**
 * Roll up every completed Dhaka day (today excluded — it is still
 * accumulating) that has live AiCallLog rows. Days whose stored rollup
 * already covers the live rows are skipped, so a steady-state cron tick
 * costs one grouped query plus one lookup per recent day.
 *
 * Freshness rule: a completed day's rows never change or grow — they only
 * ever disappear, via the 90-day purge. So a stored rollup with
 * `calls >= live count` is at least as complete as anything a recompute
 * could produce (recomputing after a partial purge would LOSE data), and
 * only a stored count BELOW the live count triggers a recompute.
 *
 * Returns the number of days (re)rolled in this run.
 */
export async function rollupCompletedAiCallDays(): Promise<number> {
  const todayKey = dayKeyInTimeZone(BUSINESS_TIME_ZONE, new Date());
  const since = new Date(Date.now() - DISCOVERY_WINDOW_DAYS * DAY_MS);

  const dayRows = await prisma.$queryRaw<Array<{ day: string; calls: number }>>(
    Prisma.sql`
      SELECT to_char("createdAt" + interval '6 hours', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS calls
      FROM "AiCallLog"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1
    `,
  );

  let rolled = 0;
  for (const { day, calls } of dayRows) {
    if (day >= todayKey) continue; // today (Dhaka) is not complete yet
    const existing = await prisma.aiCallDailyRollup.findUnique({
      where: { day },
      select: { calls: true },
    });
    if (existing && existing.calls >= calls) continue;
    await rollupAiCallDay(day);
    rolled += 1;
  }
  return rolled;
}
