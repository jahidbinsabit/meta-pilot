import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
import { prisma } from '@/lib/db';
import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';
import { generateWithAI } from '@/lib/ai';
import { AdobeKeywordsSchema } from '@/lib/ai/schemas';

/**
 * Generic tool runner (PROMPT 10).
 *
 * Client-side tools (halftone, dither, palette, ascii, bento) submit their
 * already-processed output here so the credit is deducted atomically and
 * the usage is logged. Server-side tools (bg-remover, ai-eps-to-jpg,
 * image-to-psd, adobe-keywords) have their own dedicated routes; this
 * route handles everything else.
 */
export async function POST(req: Request) {
  // Hoisted so the catch block can refund on failure.
  let userId = '';
  let cost = 0;
  let deducted = false;
  try {
    const user = await requireApiUser(req);
    userId = user.id;
    // M-B7: BYOK gate BEFORE deduction — so the frontend API-key dialog
    // fires instead of a generic 500 after deduct+refund.
    const keyError = await requireUserApiKeyIfNeeded(user.id);
    if (keyError) {
      return NextResponse.json(keyError, { status: 400 });
    }
    const body = await req.json();
    const { slug, input, metadata } = body;
    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug_required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    cost = await getToolCost(slug);
    let balance = 0;
    if (cost > 0) {
      const charged = await chargeCredits(user.id, cost, 'SPEND', { slug });
      if (charged instanceof NextResponse) return charged;
      const deduction = charged;
      balance = deduction.balance;
      // Only refund when credits were actually taken (not unlimited mode).
      deducted = deduction.deducted === true;
    }

    let result: any;
    switch (slug) {
      case 'adobe-keywords': {
        const subject = String(input || '').trim();
        if (!subject) throw new Error('subject_required');
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
          userId: user.id,
        });
        result = ai.parsed || { keywords: [subject], longTail: [], categories: [] };
        break;
      }
      case 'alt-text': {
        const subject = String(input || '').trim();
        if (!subject) throw new Error('subject_required');
        const ai = await generateWithAI({
          toolSlug: slug,
          systemPrompt: 'You write concise, descriptive alt text for images.',
          userPrompt: `Write a concise, descriptive alt text for: ${subject}`,
          maxTokens: 256,
          temperature: 0.4,
          userId: user.id,
        });
        result = { altText: ai.raw.trim() };
        break;
      }
      default:
        // Client-side tools pass through their already-computed result.
        result = input;
    }

    await prisma.toolUsage.create({
      data: { userId: user.id, tool: slug, metadata: { result, ...metadata } },
    });

    return NextResponse.json({ result, balance });
  } catch (e: any) {
    console.error('tool run failed', e);
    // Refund on failure (AI error, toolUsage.create error, etc.) — never
    // charge for a failed run. Skip in unlimited mode (nothing was deducted).
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
