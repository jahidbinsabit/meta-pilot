import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { deductCredits } from '@/lib/credits/engine';
import { generateWithAI } from '@/lib/ai';
import { MetadataSchema } from '@/lib/ai/schemas';
import { prisma } from '@/lib/db';
import { buildMetadataPrompt } from '@/lib/generator/prompt';
import type { TargetPlatform } from '@/lib/generator/types';
import { isUserApiKeyRequired, getUserAiKeysStatus } from '@/lib/ai/user-keys';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = await req.json();
    const {
      prompt,
      titleLength = 60,
      keywordCount = 12,
      includeDescription = true,
      description = true,
      prefix = true,
      suffix = true,
      negativeWords = true,
      altText = true,
      platform = 'adobe',
    } = body;
    const shouldIncludeDescription = includeDescription !== false && description !== false;
    if (!prompt)
      return new Response(JSON.stringify({ error: 'prompt_required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });

    // Check if user API key is enforced
    const keyRequired = await isUserApiKeyRequired();
    if (keyRequired) {
      const keysStatus = await getUserAiKeysStatus(user.id);
      if (!keysStatus.hasAnyKey) {
        return NextResponse.json(
          {
            error: 'user_api_key_required',
            message: 'API Key is required. Please configure your API key in Settings to continue.',
          },
          { status: 400 },
        );
      }
    }

    const targetPlatform: TargetPlatform = platform || 'adobe';
    const cost = 1;
    const deduction = await deductCredits(user.id, cost, 'SPEND', {
      prompt: prompt.slice(0, 120),
      toolSlug: 'metadata-generator',
      platform: targetPlatform,
    });
    if (!deduction.ok) {
      return new Response(
        JSON.stringify({ error: 'insufficient_credits', balance: deduction.balance }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { systemPrompt, userPrompt } = buildMetadataPrompt({
      settings: {
        titleLength: Number(titleLength) || 60,
        titleMin: 10,
        titleMax: 150,
        descriptionLength: 200,
        includeDescription: shouldIncludeDescription,
        keywordsCount: Number(keywordCount) || 12,
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
    console.error('metadata generation failed', e);
    return new Response(JSON.stringify({ error: e.message || 'generation_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
