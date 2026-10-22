import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { getGeneratorSettings } from '@/lib/generator/settings';
import { buildMetadataPrompt, buildRetrySystemPrompt } from '@/lib/generator/prompt';
import type { TargetPlatform } from '@/lib/generator/types';
import { generateWithAI } from '@/lib/ai';
import { MetadataSchema } from '@/lib/ai/schemas';
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
    const CONCURRENCY = 10; // Process 10 images concurrently for faster generation

    const processImage = async (img: BatchImage) => {
      const entry: any = {
        id: img.id,
        fileName: img.fileName,
        status: 'failed',
        error: undefined,
        title: '',
        description: '',
        keywords: [],
        altText: '',
        platform: targetPlatform,
      };

      try {
        const { systemPrompt, userPrompt } = buildMetadataPrompt({
          settings: merged as any,
          imageDescription: img.description,
          fileName: img.fileName,
          platform: targetPlatform,
        });
        let ai = await generateWithAI({
          toolSlug: 'metadata-generator',
          systemPrompt,
          userPrompt,
          imageUrls: [img.previewUrl],
          responseSchema: MetadataSchema,
          responseSchemaName: 'Metadata',
          maxTokens: 1024,
          temperature: 0.7,
          userId: user.id,
        });

        let parsed: any = ai.parsed as any;
        if (!parsed) {
          // Retry once with a stricter JSON-only instruction.
          const retrySys = buildRetrySystemPrompt({
            settings: merged as any,
            platform: targetPlatform,
          });
          ai = await generateWithAI({
            toolSlug: 'metadata-generator',
            systemPrompt: retrySys,
            userPrompt,
            imageUrls: [img.previewUrl],
            responseSchema: MetadataSchema,
            responseSchemaName: 'Metadata',
            maxTokens: 1024,
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
        if (!parsed || typeof parsed.title !== 'string') {
          throw new Error('The AI returned an invalid metadata response. Please try again.');
        }

        const includeDescription = (merged as any).includeDescription !== false;
        entry.status = 'complete';
        entry.title = String(parsed.title).slice(0, merged.titleLength);
        entry.description = includeDescription
          ? String(parsed.description || '').slice(0, merged.descriptionLength)
          : '';
        entry.keywords = Array.isArray(parsed.keywords)
          ? parsed.keywords.map((k: any) => String(k)).slice(0, merged.keywordsCount)
          : [];
        entry.altText = String(parsed.altText || '');
        entry.platform = targetPlatform;
        entry.provider = ai.provider;
        entry.model = ai.model;
        entry.tokensUsed = ai.usage.totalTokens;
      } catch (e: any) {
        failed += 1;
        entry.error = 'generation_failed';
      }

      return entry;
    };

    // Process images in concurrent batches
    for (let i = 0; i < images.length; i += CONCURRENCY) {
      const chunk = images.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map((img) => processImage(img)));
      results.push(...chunkResults);
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
