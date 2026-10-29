import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
import { prisma } from '@/lib/db';
import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';
import { rateLimit } from '@/lib/rate-limit';
import { generateWithAI } from '@/lib/ai';
import { AdobeKeywordsSchema } from '@/lib/ai/schemas';
import {
  ToolValidationError,
  keywordDensity,
  contrastChecker,
  keywordClustering,
  titleAb,
  batchExport,
} from '@/lib/tools/text-tools';
import { assertToolRunnable, toolGateErrorResponse } from '@/lib/tools/gate';

/**
 * Generic tool runner (PROMPT 10).
 *
 * Handles the text tools. Server-side media tools (bg-remover,
 * ai-eps-to-jpg, image-to-psd) have their own dedicated routes, and the
 * in-browser creative tools are free — they never call this route.
 *
 * Honesty rule (Audit R6 / N3): the result is computed FIRST and credits
 * are charged only when a real result exists. Validation failures return
 * 400 with a clear message and are never charged; unknown slugs are a
 * 400, never an echo of the input. (Previously every unhandled slug hit
 * `default: result = input` AFTER the credit was deducted.)
 *
 * R7 hardening:
 * - The BYOK user-API-key gate applies ONLY to slugs that actually call
 *   an AI provider (R7-02). The deterministic text tools run locally and
 *   must stay usable for keyless users while BYOK mode is on.
 * - Input is size-capped BEFORE compute and runs are rate-limited per
 *   user (N2): the compute-first ordering otherwise lets one free
 *   account pin the single Node process with unbounded text at no cost.
 * - An AI response that parses to nothing usable is a FAILED run
 *   (no charge), not a billable empty/fabricated result (R7-06).
 */

/** Slugs whose compute path calls an AI provider (generateWithAI). */
const AI_TOOL_SLUGS = new Set(['adobe-keywords', 'alt-text']);

/** Hard cap on tool input text, enforced before any compute. */
const MAX_TOOL_INPUT_CHARS = 100_000;

/** Per-user run budget: 60 runs per 10 minutes. */
const TOOL_RUN_LIMIT = { max: 60, windowMs: 10 * 60 * 1000 };
async function computeToolResult(slug: string, input: unknown, userId: string): Promise<any> {
  const text = String(input ?? '');
  switch (slug) {
    case 'adobe-keywords': {
      const subject = text.trim();
      if (!subject) throw new ToolValidationError('Enter a subject first.');
      const systemPrompt =
        'You are an SEO keyword strategist for Adobe Stock. Return strict JSON: { "keywords": ["..."], "longTail": ["..."], "categories": ["..."] }.';
      const userPrompt = `Subject: "${subject}". Generate a ranked keyword list sized for Adobe Stock's 50-keyword limit. Include short-tail and long-tail phrases, plus suggested Adobe Stock categories.`;
      const ai = await generateWithAI({
        toolSlug: slug,
        systemPrompt,
        userPrompt,
        responseSchema: AdobeKeywordsSchema,
        responseSchemaName: 'AdobeKeywords',
        maxTokens: 1024,
        temperature: 0.6,
        userId,
      });
      // R7-06: an unparseable model response is a failed generation, NOT
      // a billable result. (The old fallback handed the user's own subject
      // back as the "keywords" — the R6-N3 echo pattern in miniature.)
      // Throwing here means no charge (compute-first ordering).
      if (!ai.parsed) {
        throw new Error('ai_empty_result');
      }
      return ai.parsed;
    }
    case 'alt-text': {
      const subject = text.trim();
      if (!subject) throw new ToolValidationError('Enter a subject first.');
      const ai = await generateWithAI({
        toolSlug: slug,
        systemPrompt: 'You write concise, descriptive alt text for images.',
        userPrompt: `Write a concise, descriptive alt text for: ${subject}`,
        maxTokens: 256,
        temperature: 0.4,
        userId,
      });
      // R7-06: an empty model response is a failed generation (no charge),
      // never a billable empty result.
      const altText = ai.raw.trim();
      if (!altText) {
        throw new Error('ai_empty_result');
      }
      return { altText };
    }
    case 'keyword-density':
      return keywordDensity(text);
    case 'contrast-checker':
      return contrastChecker(text);
    case 'keyword-clustering':
      return keywordClustering(text);
    case 'title-ab':
      return titleAb(text);
    case 'batch-export':
      return batchExport(text);
    default:
      throw new ToolValidationError(`Unknown tool: ${slug}`);
  }
}

export async function POST(req: Request) {
  // Hoisted so the catch block can refund if a post-charge step fails.
  let userId = '';
  let cost = 0;
  let deducted = false;
  try {
    const user = await requireApiUser(req);
    userId = user.id;

    // N2: per-user rate limit BEFORE any compute. Keys on the user id
    // (not IP) via the shared in-memory limiter.
    const rl = rateLimit(`tools-run:${user.id}`, TOOL_RUN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { slug, input, metadata } = body ?? {};
    if (!slug) {
      return NextResponse.json({ error: 'slug_required' }, { status: 400 });
    }

    // R9 B9-06/S9-01: registry gate BEFORE any compute or charge — a
    // tool the admin disabled, or one restricted to other plan tiers,
    // must not execute just because the caller knows the API shape.
    // Unknown slugs return null here and keep the existing
    // "Unknown tool" 400 from computeToolResult below.
    try {
      await assertToolRunnable(slug, user);
    } catch (e) {
      const gateRes = toolGateErrorResponse(e);
      if (gateRes) return gateRes;
      throw e;
    }

    // M-B7 + R7-02: the BYOK gate fires BEFORE compute/charge so the
    // frontend API-key dialog appears instead of a generic 500 — but ONLY
    // for slugs that call an AI provider. The deterministic text tools
    // (keyword-density, contrast-checker, keyword-clustering, title-ab,
    // batch-export) run locally and are never gated.
    if (AI_TOOL_SLUGS.has(slug)) {
      const keyError = await requireUserApiKeyIfNeeded(user.id);
      if (keyError) {
        return NextResponse.json(keyError, { status: 400 });
      }
    }

    // N2: cap input size BEFORE compute (the deterministic tools scan the
    // text; unbounded input is a free CPU/memory DoS on a shared process).
    if (typeof input === 'string' && input.length > MAX_TOOL_INPUT_CHARS) {
      return NextResponse.json(
        {
          error: 'input_too_large',
          message: `Input is too large (max ${MAX_TOOL_INPUT_CHARS.toLocaleString()} characters).`,
        },
        { status: 400 },
      );
    }

    cost = await getToolCost(slug);

    // 1) Compute the result FIRST — no charge until a real result exists.
    let result: any;
    try {
      result = await computeToolResult(slug, input, user.id);
    } catch (e) {
      if (e instanceof ToolValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    // 2) Charge only for the produced result.
    let balance = 0;
    if (cost > 0) {
      const charged = await chargeCredits(user.id, cost, 'SPEND', { slug });
      if (charged instanceof NextResponse) return charged;
      balance = charged.balance;
      // Only refund when credits were actually taken (not unlimited mode).
      deducted = charged.deducted === true;
    }

    // 3) Log usage. A failure here throws into the catch block, which
    // refunds the deduction above — never charge for an unlogged run.
    // R7-05: caller `metadata` is spread FIRST so it can never overwrite
    // the server-computed `result`, and it is size-capped (an unbounded
    // metadata blob would bloat the ToolUsage row on every run).
    const safeMetadata =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {};
    const boundedMetadata =
      JSON.stringify(safeMetadata).length <= 4096 ? safeMetadata : {};
    await prisma.toolUsage.create({
      data: { userId: user.id, tool: slug, metadata: { ...boundedMetadata, result } },
    });

    return NextResponse.json({ result, balance });
  } catch (e: any) {
    console.error('tool run failed', e);
    // Refund when a post-charge step failed (e.g. toolUsage.create).
    // Skip in unlimited mode (nothing was deducted).
    if (userId && deducted && cost > 0) {
      try {
        await refundCredits(userId, '', cost, { toolSlug: 'tools/run' });
      } catch (refundErr) {
        console.error('tool run refund failed', refundErr);
      }
    }
    return new Response(JSON.stringify({ error: 'tool_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
