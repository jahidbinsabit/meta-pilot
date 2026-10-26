import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { searchByContributor, searchByKeyword, recordQuery } from '@/lib/adobe-analytics/service';
import { getAnalyticsGate } from '@/lib/adobe-analytics/tiers';
import { isAdobeConfigured } from '@/lib/adobe-analytics/adobe-stock';
import { isApifyConfigured } from '@/lib/adobe-analytics/apify-stock';
import { contributorSearchSchema, keywordSearchSchema } from '@/lib/adobe-analytics/types';

export const dynamic = 'force-dynamic';

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

  try {
    // Per-user daily search cap (audit N9): every search can trigger a paid
    // Apify run billed to the owner's token, so cap searches per user per
    // day. Admins are exempt. Adjust via the ADOBE_DAILY_SEARCH_LIMIT env
    // var (default 30) — no admin UI by design. The window is the UTC
    // calendar day: AdobeAnalyticsQuery rows with createdAt >= UTC midnight.
    const DAILY_SEARCH_LIMIT = Number(process.env.ADOBE_DAILY_SEARCH_LIMIT) || 30;
    if (user.role !== 'ADMIN') {
      const startOfUtcDay = new Date();
      startOfUtcDay.setUTCHours(0, 0, 0, 0);
      const searchesToday = await prisma.adobeAnalyticsQuery.count({
        where: { userId: user.id, createdAt: { gte: startOfUtcDay } },
      });
      if (searchesToday >= DAILY_SEARCH_LIMIT) {
        return err(
          `Daily Adobe Analytics search limit reached (${DAILY_SEARCH_LIMIT}/day). Try again tomorrow.`,
          429,
        );
      }
    }

    if (queryType === 'contributor') {
      const parsed = contributorSearchSchema.safeParse(rest);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'invalid_request', issues: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const contributorId = Number(parsed.data.contributorId);
      const result = await searchByContributor({
        userId: user.id,
        contributorId,
        sort: parsed.data.sort,
        contentType: parsed.data.contentType,
        generativeAi: parsed.data.generativeAi,
      });

      // Best-effort history; result payload is trimmed to counts, not assets.
      await recordQuery(user.id, 'contributor_id', String(contributorId), {
        totalAssets: result.totalAssets,
        assetCount: result.assets.length,
        tier: result.tier,
      });

      return NextResponse.json({ type: 'contributor', result });
    }

    const parsed = keywordSearchSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_request', issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await searchByKeyword({ userId: user.id, ...parsed.data });

    await recordQuery(user.id, 'keyword', parsed.data.query, {
      totalResults: result.totalResults,
      assetCount: result.assets.length,
      tier: result.tier,
    });

    return NextResponse.json({ type: 'keyword', result });
  } catch (e) {
    console.error('adobe analytics search failed', e);
    return err('search_failed', 500);
  }
}
