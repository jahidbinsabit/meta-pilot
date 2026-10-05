import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { deductCredits, refundCredits } from '@/lib/credits/engine';
import { prisma } from '@/lib/db';
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
  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const { slug, input, metadata } = body;
    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug_required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cost = await getToolCost(slug);
    if (cost > 0) {
      const deduction = await deductCredits(user.id, cost, `tool_${slug}`, { slug });
      if (!deduction.ok) {
        return new Response(
          JSON.stringify({ error: 'insufficient_credits', balance: deduction.balance }),
          { status: 402, headers: { 'Content-Type': 'application/json' } },
        );
      }
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

    return NextResponse.json({ result, balance: 0 });
  } catch (e: any) {
    console.error('tool run failed', e);
    return new Response(JSON.stringify({ error: e?.message || 'tool_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
