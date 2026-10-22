import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { getGeneratorSettings } from '@/lib/generator/settings';
import { buildMetadataBatchPrompt, buildRetryBatchSystemPrompt } from '@/lib/generator/prompt';
import type { TargetPlatform } from '@/lib/generator/types';
import { generateWithAI } from '@/lib/ai';
import { MetadataBatchSchema } from '@/lib/ai/schemas';
import { deductCredits, refundCredits } from '@/lib/credits/engine';
import { isInsufficientCreditsError } from '@/lib/credits/errors';
import { getToolCost } from '@/lib/credits/cost';
import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';

// Batch of up to 100 images — allow the full 5-minute function timeout
// so refunds can complete instead of the function being killed mid-refund.
export const maxDuration = 300;

interface BatchImage {
  id: string;
  fileName: string;
  previewUrl: string;
  description: string;
  mimeType: string;
}

export async function POST(req: Request) {
  // Hoisted so the outer catch can refund on total failure.
  let userId = '';
  let total = 0;
  let deducted = false;
  let refundedForFailures = 0;
  try {
    const user = await requireApiUserOrKey(req, 'tools:run');
    userId = user.id;
    const body = await req.json();
    const {
      images,
      settings: overrides,
      platform = 'adobe',
    } = body as {
      images: BatchImage[];
      settings?: Partial<Record<string, any>>;
      platform?: TargetPlatform;
    };
    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'images_required' }, { status: 400 });
    }

    // Check if user API key is enforced
    const keyError = await requireUserApiKeyIfNeeded(user.id);
    if (keyError) {
      return NextResponse.json(keyError, { status: 400 });
    }

    // Validate maximum batch size to prevent resource exhaustion
    const MAX_BATCH_SIZE = 100;
    if (images.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: 'batch_too_large', max: MAX_BATCH_SIZE, received: images.length },
        { status: 400 }
      );
    }

    const targetPlatform: TargetPlatform =
      platform || (overrides as any)?.targetPlatform || 'adobe';
    const settings = await getGeneratorSettings();
    const merged = { ...settings, ...(overrides || {}) };

    const costPerImage = await getToolCost('metadata-generator');
    total = images.length * costPerImage;
    let deduction;
    try {
      deduction = await deductCredits(user.id, total, 'SPEND', {
        imageCount: images.length,
        costPerImage,
        toolSlug: 'metadata-generator',
        platform: targetPlatform,
      });
    } catch (e) {
      if (isInsufficientCreditsError(e)) {
        return NextResponse.json(
          { error: 'insufficient_credits', balance: e.balance, needed: e.needed },
          { status: 402 },
        );
      }
      throw e;
    }
    if (!deduction.ok) {
      return NextResponse.json(
        { error: 'insufficient_credits', balance: deduction.balance, needed: total },
        { status: 402 },
      );
    }
    // Only refunds when credits were actually taken (not unlimited mode).
    deducted = deduction.deducted === true;

    // Create a ToolJob snapshot so the batch is trackable and refundable.
    const job = await prisma.toolJob.create({
      data: {
        userId: user.id,
        toolSlug: 'metadata-generator',
        status: 'PROCESSING',
        inputFileUrls: images.map((i) => i.previewUrl),
        creditsCharged: deducted ? total : 0,
        outputData: {
          platform: targetPlatform,
          settings: merged,
          images: images.map((i) => ({ id: i.id, fileName: i.fileName })),
        } as any,
      },
    });

    const results: any[] = [];
    let failed = 0;

    // Multi-image batching: up to 5 images go in ONE AI call (free-tier
    // Gemini quota is 15 requests/min — one call per image burned it and
    // triggered 429 retry storms). 3 groups run concurrently.
    const GROUP_SIZE = 5;
    const GROUP_CONCURRENCY = 3;

    const groups: BatchImage[][] = [];
    for (let i = 0; i < images.length; i += GROUP_SIZE) {
      groups.push(images.slice(i, i + GROUP_SIZE));
    }

    const processGroup = async (group: BatchImage[]) => {
      const entries: any[] = group.map((img) => ({
        id: img.id,
        fileName: img.fileName,
        status: 'failed',
        error: undefined,
        title: '',
        description: '',
        keywords: [],
        altText: '',
        platform: targetPlatform,
      }));

      try {
        const { systemPrompt, userPrompt } = buildMetadataBatchPrompt({
          settings: merged as any,
          images: group.map((img) => ({
            fileName: img.fileName,
            description: img.description,
          })),
          platform: targetPlatform,
        });
        let ai = await generateWithAI({
          toolSlug: 'metadata-generator',
          systemPrompt,
          userPrompt,
          imageUrls: group.map((img) => img.previewUrl),
          responseSchema: MetadataBatchSchema,
          responseSchemaName: 'MetadataBatch',
          maxTokens: 4096,
          temperature: 0.7,
          userId: user.id,
        });

        let parsed: any = ai.parsed as any;
        if (!parsed) {
          // Retry the whole group once with a stricter JSON-only instruction.
          const retrySys = buildRetryBatchSystemPrompt({
            settings: merged as any,
            platform: targetPlatform,
            count: group.length,
          });
          ai = await generateWithAI({
            toolSlug: 'metadata-generator',
            systemPrompt: retrySys,
            userPrompt,
            imageUrls: group.map((img) => img.previewUrl),
            responseSchema: MetadataBatchSchema,
            responseSchemaName: 'MetadataBatch',
            maxTokens: 4096,
            temperature: 0.2,
            userId: user.id,
          });
          if (!ai.success && ai.errorMessage) {
            throw new Error(ai.errorMessage);
          }
          parsed = ai.parsed as any;
        }

        if (!ai.success && ai.errorMessage) {
          throw new Error(ai.errorMessage);
        }
        const batchResults: any[] = Array.isArray(parsed?.results) ? parsed.results : [];
        if (batchResults.length === 0) {
          throw new Error('The AI returned an invalid metadata response. Please try again.');
        }

        // Map results back to images by 1-based index. Indices the model
        // skipped stay 'failed' (and are refunded like any failure).
        const byIndex = new Map<number, any>();
        for (const r of batchResults) {
          if (r && typeof r.index === 'number') byIndex.set(r.index, r);
        }

        const includeDescription = (merged as any).includeDescription !== false;
        group.forEach((img, i) => {
          const r = byIndex.get(i + 1);
          if (!r || typeof r.title !== 'string') return;
          const entry = entries[i];
          entry.status = 'complete';
          entry.title = String(r.title).slice(0, merged.titleLength);
          entry.description = includeDescription
            ? String(r.description || '').slice(0, merged.descriptionLength)
            : '';
          entry.keywords = Array.isArray(r.keywords)
            ? r.keywords.map((k: any) => String(k)).slice(0, merged.keywordsCount)
            : [];
          entry.altText = String(r.altText || '');
          entry.platform = targetPlatform;
          entry.provider = ai.provider;
          entry.model = ai.model;
          entry.tokensUsed = ai.usage.totalTokens;
        });
      } catch (e: any) {
        // Whole group call failed — every entry stays 'failed'.
      }

      for (const entry of entries) {
        if (entry.status !== 'complete') {
          failed += 1;
          entry.error = 'generation_failed';
        }
      }

      return entries;
    };

    // Process groups with limited concurrency
    for (let i = 0; i < groups.length; i += GROUP_CONCURRENCY) {
      const chunk = groups.slice(i, i + GROUP_CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map((g) => processGroup(g)));
      for (const entries of chunkResults) results.push(...entries);
    }

    const succeeded = results.filter((r) => r.status === 'complete').length;

    // Refund the credit share for every failed image in this batch.
    // Skip entirely in unlimited mode — refunding when nothing was deducted
    // would mint phantom credits.
    if (failed > 0 && deducted) {
      const refundAmount = failed * costPerImage;
      try {
        await refundCredits(user.id, job.id, refundAmount);
        refundedForFailures = refundAmount;
      } catch (e) {
        console.error('refund failed', e);
      }
    }

    await prisma.toolJob.update({
      where: { id: job.id },
      data: {
        status: failed === images.length ? 'FAILED' : 'COMPLETE',
        outputData: { results, platform: targetPlatform } as any,
        errorMessage: failed > 0 ? `${failed} image(s) failed` : undefined,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      jobId: job.id,
      platform: targetPlatform,
      results,
      succeeded,
      failed,
      balance: deduction.balance,
      refunded: deducted ? refundedForFailures : 0,
    });
  } catch (e: any) {
    console.error('batch generation failed', e);
    // Total failure after deduction (e.g. toolJob.create threw): refund
    // whatever wasn't already refunded per-image. Never charge for failure.
    if (userId && deducted) {
      const remaining = total - refundedForFailures;
      if (remaining > 0) {
        try {
          await refundCredits(userId, '', remaining, { toolSlug: 'metadata-generator' });
        } catch (refundErr) {
          console.error('batch total-failure refund failed', refundErr);
        }
      }
    }
    return NextResponse.json({ error: 'batch_failed' }, { status: 500 });
  }
}
