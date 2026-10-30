import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { searchByContributor, searchByKeyword, recordQuery } from '@/lib/adobe-analytics/service';
import {
  getAnalyticsGate,
  plannedContributorFetchRows,
  plannedKeywordFetchRows,
  MAX_DAILY_FETCH_ROWS,
  type AnalyticsGate,
} from '@/lib/adobe-analytics/tiers';
import { hasUsablePoolCache } from '@/lib/adobe-analytics/pool-cache';
import { isAdobeConfigured } from '@/lib/adobe-analytics/adobe-stock';
import { isApifyConfigured } from '@/lib/adobe-analytics/apify-stock';
import { contributorSearchSchema, keywordSearchSchema } from '@/lib/adobe-analytics/types';

export const dynamic = 'force-dynamic';

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Daily-cap 429 with the upgrade payload (R9 N3): the same gate fields
 * a search RESULT carries (`limit` / `tier` / `planName`, plus the
 * resolved `dailyCap`) ride along so the client can render the upgrade
 * gate with a billing CTA instead of a bare error string.
 */
function dailyCapResponse(message: string, gate: AnalyticsGate) {
  return NextResponse.json(
    {
      error: message,
      limit: gate.limit,
      tier: gate.tier,
      planName: gate.planName,
      dailyCap: gate.dailyCap,
    },
    { status: 429 },
  );
}

function handleAuth(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'UNAUTHORIZED') return err('unauthorized', 401);
  if (msg === 'FORBIDDEN') return err('forbidden', 403);
  return null;
}

/**
 * GET  /api/adobe-analytics            -> recent query history + tier gate
 * POST /api/adobe-analytics            -> run a keyword or contributor search
 *
 * This module never consumes image-generation credits: access is a
 * function of plan tier, enforced server-side in getAnalyticsGate(),
 * plus a per-user daily search cap in POST (paid Apify runs are billed
 * to the owner's token).
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(req);
    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));

    const [queries, gate, apifyActive] = await Promise.all([
      prisma.adobeAnalyticsQuery.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, queryType: true, queryValue: true, createdAt: true },
      }),
      getAnalyticsGate(user.id),
      isApifyConfigured(),
    ]);

    return NextResponse.json({
      queries,
      gate,
      adobeConfigured: apifyActive || isAdobeConfigured(),
      scraperEngine: apifyActive ? 'apify' : 'stock_api',
    });
  } catch (e) {
    return handleAuth(e) ?? err('failed_to_load_history', 500);
  }
}

/**
 * Reserve one search attempt against the daily cap (audit N1): the
 * AdobeAnalyticsQuery row is created BEFORE the search runs and counts
 * ATTEMPTS, not successes — a search that fails after the Apify actor
 * starts still cost the owner money, so it stays counted.
 *
 * Atomicity: count + insert run inside a Serializable transaction.
 * Under Postgres SSI, a concurrent transaction inserting a row that
 * matches this transaction's count predicate aborts one of them with
 * P2034, so parallel bursts serialize instead of all passing a stale
 * count. P2034 is retried (bounded) so a legit user is not rejected by
 * a transient conflict; if conflicts persist we return null and the
 * caller 429s — the safe direction for a cost cap.
 *
 * Returns the attempt row id, or null when the cap is already reached.
 */
async function reserveSearchAttempt(
  userId: string,
  limit: number,
  queryType: 'keyword' | 'contributor_id',
  queryValue: string,
): Promise<string | null> {
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Continuation-usage rows (resultData.continuation === true,
          // written by recordContinuationUse) live in the same table
          // but are NOT search attempts — exclude them so progressive-
          // loading chunks don't eat the daily cap they ride along on.
          // Cache-hit rows (resultData.cacheHit === true, R9 H2) are
          // excluded for the same reason: the search ran no paid actor
          // run, so it must not consume an attempt either. (The row
          // still transiently counts while its search is in flight —
          // resultData is only filled in on completion.)
          const rowsToday = await tx.adobeAnalyticsQuery.findMany({
            where: { userId, createdAt: { gte: startOfUtcDay } },
            select: { resultData: true },
          });
          const searchesToday = rowsToday.filter((r) => {
            const d = r.resultData as any;
            return !(
              d &&
              typeof d === 'object' &&
              (d.continuation === true || d.cacheHit === true)
            );
          }).length;
          if (searchesToday >= limit) return null;
          const row = await tx.adobeAnalyticsQuery.create({
            data: { userId, queryType, queryValue, resultData: undefined },
            select: { id: true },
          });
          return row.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e: any) {
      if (e?.code === 'P2034' && attempt < 2) continue;
      if (e?.code === 'P2034') return null;
      throw e;
    }
  }
  return null;
}

/** Best-effort: fill in an attempt row's outcome (counts or failure). */
async function completeSearchAttempt(attemptId: string | null, resultData: unknown) {
  if (!attemptId) return;
  try {
    await prisma.adobeAnalyticsQuery.update({
      where: { id: attemptId },
      data: { resultData: resultData as any },
    });
  } catch {
    // History is best-effort; never fail a search because logging failed.
  }
}

/**
 * Continuation budget (T4-02 fix). Progressive-loading chunks ride
 * along free on the search that opened a contributor today, but every
 * chunk is a fresh PAID actor run and its `want` is the cumulative
 * fetch depth it bills for — so the day's continuation wants are
 * summed per (user, contributor): while serving another chunk keeps
 * that sum within this budget the chunk stays free; past it, the
 * request must consume a normal daily attempt (reserveSearchAttempt),
 * restoring the daily cap's purpose. A normal first chain stays free
 * for its early chunks and degrades into counted attempts instead of
 * hard-failing; outright repetition (e.g. re-running want=1000 all
 * day) is bounded to one free run plus the 30/day attempt cap.
 */
const CONTINUATION_DAILY_WANT_BUDGET = 1000;

/** Sum of today's recorded continuation wants for one contributor. */
async function continuationWantServedToday(
  userId: string,
  contributorId: number,
): Promise<number> {
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.adobeAnalyticsQuery.findMany({
    where: {
      userId,
      queryType: 'contributor_id',
      queryValue: String(contributorId),
      createdAt: { gte: startOfUtcDay },
    },
    select: { resultData: true },
  });
  let served = 0;
  for (const r of rows) {
    const d = r.resultData as any;
    // Cache-served chunks (cacheHit) consumed no paid depth, so they
    // don't eat the continuation budget either.
    if (
      d &&
      typeof d === 'object' &&
      d.continuation === true &&
      d.cacheHit !== true &&
      typeof d.want === 'number'
    ) {
      served += d.want;
    }
  }
  return served;
}

/**
 * Record one continuation chunk's usage BEFORE the search runs (like
 * attempt reservations, usage counts even if the run then fails — the
 * actor may already have billed). The row carries queryType/queryValue
 * of the search it extends and is flagged via `resultData.continuation`
 * so the daily-cap count can exclude it and any future recent-searches
 * UI can ignore it. Best-effort: never fails the search. Returns the
 * row id so a chunk that turns out to be cache-served can be re-flagged
 * afterwards (markContinuationCacheHit).
 */
async function recordContinuationUse(
  userId: string,
  contributorId: number,
  want: number,
): Promise<string | null> {
  try {
    const row = await prisma.adobeAnalyticsQuery.create({
      data: {
        userId,
        queryType: 'contributor_id',
        queryValue: String(contributorId),
        resultData: { continuation: true, want } as any,
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    // Accounting is best-effort; never fail a search because logging failed.
    return null;
  }
}

/**
 * Re-flag a continuation row whose chunk was served from the pool
 * cache: no actor run happened, so neither the continuation budget
 * nor the daily fetched-rows budget may charge for it. Best-effort.
 */
async function markContinuationCacheHit(rowId: string | null, want: number) {
  if (!rowId) return;
  try {
    await prisma.adobeAnalyticsQuery.update({
      where: { id: rowId },
      data: { resultData: { continuation: true, want, cacheHit: true } as any },
    });
  } catch {
    // Accounting is best-effort; never fail a search because logging failed.
  }
}

/**
 * Rows today's REAL actor runs fetched for this user (R9 B9-07) — the
 * sum the MAX_DAILY_FETCH_ROWS budget enforces. Per AdobeAnalyticsQuery
 * row, in priority order:
 *  - cacheHit rows fetched nothing → 0;
 *  - continuation rows carry their billed cumulative depth in `want`
 *    (each chunk is its own actor run billed at that depth);
 *  - attempt/history rows recorded by current code carry the run's
 *    billed maxItems in `fetchedRows`;
 *  - legacy rows from earlier today (pre-budget deploys) fall back to
 *    their recorded visible `assetCount` — an approximation that only
 *    matters on the deploy day itself.
 * In-flight attempts (resultData not yet filled) contribute 0 here;
 * each is bounded by its own pre-run budget check.
 */
async function fetchedRowsToday(userId: string): Promise<number> {
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.adobeAnalyticsQuery.findMany({
    where: { userId, createdAt: { gte: startOfUtcDay } },
    select: { resultData: true },
  });
  let total = 0;
  for (const r of rows) {
    const d = r.resultData as any;
    if (!d || typeof d !== 'object') continue;
    if (d.cacheHit === true) continue;
    if (d.continuation === true) {
      if (typeof d.want === 'number') total += d.want;
      continue;
    }
    if (typeof d.fetchedRows === 'number') {
      total += d.fetchedRows;
    } else if (typeof d.assetCount === 'number') {
      total += d.assetCount;
    }
  }
  return total;
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireApiUser(req);
  } catch (e) {
    return handleAuth(e) ?? err('unauthorized', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('invalid_json', 400);
  }

  const { type, ...rest } = (body ?? {}) as Record<string, unknown>;
  const queryType = type === 'contributor' ? 'contributor' : 'keyword';

  // Set once the attempt row exists (non-admins only); used to record the
  // outcome on both the success and failure paths.
  let attemptId: string | null = null;

  try {
    // Per-user daily search cap (audit N9, hardened in R7/N1): every search
    // can trigger a paid Apify run billed to the owner's token, so cap
    // ATTEMPTS per user per day. Admins are exempt. The cap is
    // plan-aware (R9 N3): the user's Plan row can carry its own
    // `adobeAnalyticsDailyCap`; otherwise the gate falls back to the
    // ADOBE_DAILY_SEARCH_LIMIT env var (default 30). The window is
    // the UTC calendar day: AdobeAnalyticsQuery rows with
    // createdAt >= UTC midnight. The gate is resolved ONCE here so
    // the cap, the fetched-rows budget and the 429 upgrade payload
    // all read the same values.
    const gate = await getAnalyticsGate(user.id);
    const DAILY_SEARCH_LIMIT = gate.dailyCap;
    const isAdmin = user.role === 'ADMIN';

    if (queryType === 'contributor') {
      const parsed = contributorSearchSchema.safeParse(rest);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'invalid_request', issues: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const contributorId = Number(parsed.data.contributorId);

      // Daily fetched-rows budget (R9 B9-07): the attempt cap counts
      // searches, not depth — a single search can bill ~1000 actor
      // rows, so attempts alone don't bound the owner's Apify spend.
      // Refuse BEFORE any actor run when today's real fetches plus
      // this run's billed depth would exceed MAX_DAILY_FETCH_ROWS. A
      // request the pool cache can serve runs no actor, so it is
      // never refused. The budget only tracks Apify spend: when the
      // scraper engine isn't configured, searches take the official
      // API path and there are no actor rows to budget.
      let plannedFetchRows: number | null = null;
      let continuationRowId: string | null = null;
      if (!isAdmin && (await isApifyConfigured())) {
        plannedFetchRows = plannedContributorFetchRows(gate.limit, parsed.data.want);
        const cacheWillServe = await hasUsablePoolCache(contributorId, plannedFetchRows, {
          contentType: parsed.data.contentType,
          generativeAi: parsed.data.generativeAi,
          sort: parsed.data.sort,
        });
        if (!cacheWillServe) {
          const usedRows = await fetchedRowsToday(user.id);
          if (usedRows + plannedFetchRows > MAX_DAILY_FETCH_ROWS) {
            return dailyCapResponse(
              `Daily Adobe Analytics data limit reached (${MAX_DAILY_FETCH_ROWS} rows/day). Try again tomorrow.`,
              gate,
            );
          }
        }
      }

      // Progressive loading: the UI fetches a small first chunk (25)
      // and then deeper pools chunk by chunk. Any request past the
      // first chunk is a CONTINUATION of a search the user already ran
      // today, not a new search — within budget it neither consumes
      // another daily attempt nor adds a history row. A non-admin
      // continuation only rides along when a counted attempt for this
      // same contributor exists today, so the cap cannot be dodged by
      // asking deep first; and the ride-along is BOUNDED (T4-02): once
      // the day's cumulative continuation depth for this contributor
      // would exceed CONTINUATION_DAILY_WANT_BUDGET, the request falls
      // through to a normal capped attempt below.
      const want = parsed.data.want ?? 25;
      const isContinuation = want > 25;
      let ridesAlong = false;
      if (isContinuation && !isAdmin) {
        const startOfUtcDay = new Date();
        startOfUtcDay.setUTCHours(0, 0, 0, 0);
        const priorAttempts = await prisma.adobeAnalyticsQuery.count({
          where: {
            userId: user.id,
            queryType: 'contributor_id',
            queryValue: String(contributorId),
            createdAt: { gte: startOfUtcDay },
          },
        });
        if (priorAttempts > 0) {
          const served = await continuationWantServedToday(user.id, contributorId);
          ridesAlong = served + want <= CONTINUATION_DAILY_WANT_BUDGET;
        }
      }
      if (ridesAlong) {
        // Account for the chunk before running it, like a reservation.
        continuationRowId = await recordContinuationUse(user.id, contributorId, want);
      }

      // Reserve BEFORE searching so the attempt counts even if the
      // search fails, and parallel bursts cannot all pass a stale count.
      if (!isAdmin && !ridesAlong) {
        attemptId = await reserveSearchAttempt(
          user.id,
          DAILY_SEARCH_LIMIT,
          'contributor_id',
          String(contributorId),
        );
        if (attemptId === null) {
          return dailyCapResponse(
            `Daily Adobe Analytics search limit reached (${DAILY_SEARCH_LIMIT}/day). Try again tomorrow.`,
            gate,
          );
        }
      }

      const result = await searchByContributor({
        userId: user.id,
        contributorId,
        sort: parsed.data.sort,
        contentType: parsed.data.contentType,
        generativeAi: parsed.data.generativeAi,
        want: parsed.data.want,
      });

      // Record the outcome; result payload is trimmed to counts, not assets.
      const resultData = {
        totalAssets: result.totalAssets,
        assetCount: result.assets.length,
        tier: result.tier,
        // R9 H2/B9-07 accounting: a cache hit fetched zero rows (and
        // its row is excluded from the daily attempt count); a real
        // actor run records the rows it billed so the fetched-rows
        // budget can sum them.
        ...(result.cacheHit
          ? { cacheHit: true }
          : plannedFetchRows !== null
            ? { fetchedRows: plannedFetchRows }
            : {}),
      };
      if (result.cacheHit) {
        // A continuation chunk pre-recorded above turns out to have
        // been free — re-flag its row so the budgets don't charge it.
        await markContinuationCacheHit(continuationRowId, want);
      }
      if (attemptId) {
        await completeSearchAttempt(attemptId, resultData);
      } else if (!isContinuation) {
        await recordQuery(user.id, 'contributor_id', String(contributorId), resultData);
      }

      return NextResponse.json({ type: 'contributor', result });
    }

    const parsed = keywordSearchSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_request', issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Daily fetched-rows budget (R9 B9-07) — same rule as the
    // contributor branch. Keyword searches have no pool cache, so a
    // configured scraper engine always means a real actor run.
    let plannedFetchRows: number | null = null;
    if (!isAdmin && (await isApifyConfigured())) {
      plannedFetchRows = plannedKeywordFetchRows(gate.limit);
      const usedRows = await fetchedRowsToday(user.id);
      if (usedRows + plannedFetchRows > MAX_DAILY_FETCH_ROWS) {
        return dailyCapResponse(
          `Daily Adobe Analytics data limit reached (${MAX_DAILY_FETCH_ROWS} rows/day). Try again tomorrow.`,
          gate,
        );
      }
    }

    if (!isAdmin) {
      attemptId = await reserveSearchAttempt(
        user.id,
        DAILY_SEARCH_LIMIT,
        'keyword',
        parsed.data.query,
      );
      if (attemptId === null) {
        return dailyCapResponse(
          `Daily Adobe Analytics search limit reached (${DAILY_SEARCH_LIMIT}/day). Try again tomorrow.`,
          gate,
        );
      }
    }

    const result = await searchByKeyword({ userId: user.id, ...parsed.data });

    const resultData = {
      totalResults: result.totalResults,
      assetCount: result.assets.length,
      tier: result.tier,
      // R9 B9-07 accounting: rows this search's actor run billed.
      ...(plannedFetchRows !== null ? { fetchedRows: plannedFetchRows } : {}),
    };
    if (attemptId) {
      await completeSearchAttempt(attemptId, resultData);
    } else {
      await recordQuery(user.id, 'keyword', parsed.data.query, resultData);
    }

    return NextResponse.json({ type: 'keyword', result });
  } catch (e) {
    // A reserved attempt whose search failed stays counted (it may still
    // have cost a paid Apify run) — mark it failed, don't delete it.
    await completeSearchAttempt(attemptId, { failed: true });
    console.error('adobe analytics search failed', e);
    return err('search_failed', 500);
  }
}
