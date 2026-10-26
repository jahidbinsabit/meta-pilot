import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
import { prisma } from '@/lib/db';
import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';
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
 */
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
      return ai.parsed || { keywords: [subject], longTail: [], categories: [] };
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
      return { altText: ai.raw.trim() };
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
    // M-B7: BYOK gate BEFORE anything else — so the frontend API-key
    // dialog fires instead of a generic 500.
    const keyError = await requireUserApiKeyIfNeeded(user.id);
    if (keyError) {
      return NextResponse.json(keyError, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const { slug, input, metadata } = body ?? {};
    if (!slug) {
      return NextResponse.json({ error: 'slug_required' }, { status: 400 });
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
    await prisma.toolUsage.create({
      data: { userId: user.id, tool: slug, metadata: { result, ...metadata } },
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
