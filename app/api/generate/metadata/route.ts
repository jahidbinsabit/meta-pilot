import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
import { generateWithAI } from '@/lib/ai';
import { MetadataSchema } from '@/lib/ai/schemas';
import { prisma } from '@/lib/db';
import { buildMetadataPrompt } from '@/lib/generator/prompt';
import type { TargetPlatform } from '@/lib/generator/types';
import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';
import { getToolCost } from '@/lib/credits/cost';

const MetadataRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'prompt_required').max(5000, 'prompt_too_long'),
  titleLength: z.coerce.number().int().positive().max(200).default(60),
  keywordCount: z.coerce.number().int().positive().max(100).default(12),
  includeDescription: z.boolean().default(true),
  description: z.boolean().default(true),
  prefix: z.boolean().default(true),
  suffix: z.boolean().default(true),
  negativeWords: z.boolean().default(true),
  altText: z.boolean().default(true),
  platform: z.enum(['adobe', 'shutterstock', 'freepik', 'vecteezy', 'istock', 'generic']).default('adobe'),
});

export async function POST(req: Request) {
  let userId: string | null = null;
  let deducted = false;
  // Per-image cost comes from the admin-configured ToolCreditCost table
  // (was hardcoded to 1, ignoring admin pricing).
  const cost = await getToolCost('metadata-generator');
  try {
    // Accept session auth OR Bearer sk_... API key (scope: metadata:generate).
    const user = await requireApiUserOrKey(req, 'metadata:generate');
    userId = user.id;
    const body = await req.json();
    const validated = MetadataRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: validated.error.issues },
        { status: 400 },
      );
    }
    const {
      prompt,
      titleLength,
      keywordCount,
      includeDescription,
      description,
      prefix,
      suffix,
      platform,
    } = validated.data;
    const shouldIncludeDescription = includeDescription !== false && description !== false;

    // Check if user API key is enforced
    const keyError = await requireUserApiKeyIfNeeded(user.id);
    if (keyError) {
      return NextResponse.json(keyError, { status: 400 });
    }

    const targetPlatform: TargetPlatform = platform || 'adobe';
    const charged = await chargeCredits(user.id, cost, 'SPEND', {
      prompt: prompt.slice(0, 120),
      toolSlug: 'metadata-generator',
      platform: targetPlatform,
    });
    if (charged instanceof NextResponse) return charged;
    const deduction = charged;
    // Only mark as deducted if credits were actually taken (not unlimited mode).
    deducted = deduction.deducted === true;

    const { systemPrompt, userPrompt } = buildMetadataPrompt({
      settings: {
        titleLength,
        titleMin: 10,
        titleMax: 150,
        descriptionLength: 200,
        includeDescription: shouldIncludeDescription,
        keywordsCount: keywordCount,
        keywordsMin: 5,
        keywordsMax: 50,
        prefix: prefix ? '' : '',
        suffix: suffix ? '' : '',
        negativeTitleWords: [],
        negativeKeywords: [],
        defaultPrefix: '',
        defaultSuffix: '',
      },
      imageDescription: prompt,
      platform: targetPlatform,
    });

    const ai = await generateWithAI({
      toolSlug: 'metadata-generator',
      systemPrompt,
      userPrompt,
      responseSchema: MetadataSchema,
      responseSchemaName: 'Metadata',
      maxTokens: 8192,
      temperature: 0.7,
      userId: user.id,
    });

    // The adapter parses + validates the response against MetadataSchema.
    // `parsed` is typed or null — a schema mismatch is logged and refunded,
    // never thrown. Fall back to raw text only when the model produced no
    // structured output at all.
    let parsed: any = ai.parsed as any;
    if (!parsed) {
      parsed = {
        title: ai.raw.slice(0, titleLength),
        description: shouldIncludeDescription ? ai.raw.slice(0, 200) : '',
        keywords: [],
        altText: '',
      };
    } else if (!shouldIncludeDescription) {
      parsed.description = '';
    }

    const record = await prisma.generatedMetadata.create({
      data: {
        userId: user.id,
        provider: ai.provider,
        model: ai.model,
        originalUrl: '',
        originalName: prompt.slice(0, 120),
        title: parsed.title || '',
        description: parsed.description || '',
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        altText: parsed.altText || '',
        metadataJson: { ...parsed, platform: targetPlatform },
        promptUsed: prompt,
        tokensUsed: ai.usage.totalTokens,
        costCents: cost,
        status: 'COMPLETED',
      },
    });

    return NextResponse.json({
      ...parsed,
      platform: targetPlatform,
      id: record.id,
      balance: deduction.balance,
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (e?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    }
    console.error('metadata generation failed', e);
    // Refund the deducted credits — never charge for a failed generation.
    if (userId && deducted) {
      try {
        await refundCredits(userId, '', cost, { toolSlug: 'metadata-generator' });
      } catch (refundErr) {
        console.error('metadata refund failed', refundErr);
      }
    }
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
