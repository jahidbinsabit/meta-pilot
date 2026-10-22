import { prisma } from '@/lib/db';
import { buildMetadataBatchPrompt, buildRetryBatchSystemPrompt } from '@/lib/generator/prompt';
import type { TargetPlatform } from '@/lib/generator/types';
import { generateWithAI } from '@/lib/ai';
import { MetadataBatchSchema } from '@/lib/ai/schemas';
import { refundCredits } from '@/lib/credits/engine';

export interface BatchImage {
  id: string;
  fileName: string;
  previewUrl: string;
  description: string;
  mimeType: string;
}

export interface RunBatchGenerationArgs {
  userId: string;
  jobId: string;
  images: BatchImage[];
  mergedSettings: any;
  platform: TargetPlatform;
  costPerImage: number;
  deduction: { deducted: boolean; balance: number };
}

/**
 * Background batch runner for the metadata generator (polling delivery).
 *
 * Same group logic as the SSE stream route — up to 5 images per AI call,
 * 3 groups concurrently, one retry per group with a stricter prompt,
 * results mapped back by 1-based index — but instead of pushing SSE
 * events it writes progress into the ToolJob row after each group, so
 * the frontend can poll `GET /api/generate/jobs/[jobId]`. SSE delivery
 * proved unreliable through the production proxy stack (browsers
 * received zero events while jobs completed server-side); plain
 * request/response polling works everywhere.
 *
 * The `results` array always preserves the original image order and
 * includes a 'processing' placeholder for images not yet processed.
 * Never throws — unexpected errors mark the job FAILED and refund the
 * not-yet-completed images.
 */
export async function runBatchGeneration(args: RunBatchGenerationArgs): Promise<void> {
  const { userId, jobId, images, platform: targetPlatform, costPerImage } = args;
  const merged = args.mergedSettings;
  let balance = args.deduction.balance;
  const deducted = args.deduction.deducted === true;

  // Fixed array indexed by image position so result order always matches
  // the upload order, regardless of which group finishes first.
  const entries: any[] = images.map((img) => ({
    id: img.id,
    fileName: img.fileName,
    status: 'processing',
    title: '',
    description: '',
    keywords: [],
    altText: '',
    platform: targetPlatform,
  }));

  let failed = 0;

  const writeProgress = async () => {
    try {
      await prisma.toolJob.update({
        where: { id: jobId },
        data: {
          outputData: {
            results: entries,
            platform: targetPlatform,
            partial: true,
          } as any,
        },
      });
    } catch (e) {
      // Progress writes are best-effort — the final update is authoritative.
      console.error('runBatchGeneration: progress update failed', e);
    }
  };

  try {
    // Publish placeholders immediately so the first poll already renders
    // one card per image.
    await writeProgress();

    const GROUP_SIZE = 5;
    const GROUP_CONCURRENCY = 3;

    const groups: { start: number; items: BatchImage[] }[] = [];
    for (let i = 0; i < images.length; i += GROUP_SIZE) {
      groups.push({ start: i, items: images.slice(i, i + GROUP_SIZE) });
    }

    let currentGroup = 0;

    async function processGroup() {
      while (currentGroup < groups.length) {
        const group = groups[currentGroup++];
        if (!group) break;

        const groupEntries: any[] = group.items.map((img) => ({
          id: img.id,
          fileName: img.fileName,
          status: 'failed',
          title: '',
          description: '',
          keywords: [],
          altText: '',
          platform: targetPlatform,
        }));

        try {
          const { systemPrompt, userPrompt } = buildMetadataBatchPrompt({
            settings: merged as any,
            images: group.items.map((img) => ({
              fileName: img.fileName,
              description: img.description,
            })),
            platform: targetPlatform,
          });

          let ai = await generateWithAI({
            toolSlug: 'metadata-generator',
            systemPrompt,
            userPrompt,
            imageUrls: group.items.map((img) => img.previewUrl),
            responseSchema: MetadataBatchSchema,
            responseSchemaName: 'MetadataBatch',
            maxTokens: 4096,
            temperature: 0.7,
            userId,
          });

          let parsed: any = ai.parsed;
          if (!parsed) {
            // Retry the whole group once with a stricter JSON-only prompt.
            const retrySys = buildRetryBatchSystemPrompt({
              settings: merged as any,
              platform: targetPlatform,
              count: group.items.length,
            });
            ai = await generateWithAI({
              toolSlug: 'metadata-generator',
              systemPrompt: retrySys,
              userPrompt,
              imageUrls: group.items.map((img) => img.previewUrl),
              responseSchema: MetadataBatchSchema,
              responseSchemaName: 'MetadataBatch',
              maxTokens: 4096,
              temperature: 0.2,
              userId,
            });
            if (!ai.success && ai.errorMessage) throw new Error(ai.errorMessage);
            parsed = ai.parsed;
          }

          if (!ai.success && ai.errorMessage) throw new Error(ai.errorMessage);
          const batchResults: any[] = Array.isArray(parsed?.results) ? parsed.results : [];
          if (batchResults.length === 0) throw new Error('Invalid AI response');

          // Map results back to images by 1-based index. Indices the model
          // skipped stay 'failed' (and are refunded like any failure).
          const byIndex = new Map<number, any>();
          for (const r of batchResults) {
            if (r && typeof r.index === 'number') byIndex.set(r.index, r);
          }

          const inclDesc = (merged as any).includeDescription !== false;
          group.items.forEach((img, i) => {
            const r = byIndex.get(i + 1);
            if (!r || typeof r.title !== 'string') return;
            const entry = groupEntries[i];
            entry.status = 'complete';
            entry.title = String(r.title).slice(0, merged.titleLength);
            entry.description = inclDesc
              ? String(r.description || '').slice(0, merged.descriptionLength)
              : '';
            entry.keywords = Array.isArray(r.keywords)
              ? r.keywords.map((k: any) => String(k)).slice(0, merged.keywordsCount)
              : [];
            entry.altText = String(r.altText || '');
            entry.provider = ai.provider;
            entry.model = ai.model;
            entry.tokensUsed = ai.usage.totalTokens;
          });
        } catch (e: any) {
          // Whole group call failed — every entry stays 'failed'.
        }

        for (let i = 0; i < groupEntries.length; i++) {
          const entry = groupEntries[i];
          if (entry.status !== 'complete') {
            failed += 1;
            entry.error = 'generation_failed';
          }
          entries[group.start + i] = entry;
        }

        await writeProgress();
      }
    }

    const workers = Array.from(
      { length: Math.min(GROUP_CONCURRENCY, groups.length) },
      () => processGroup(),
    );

    await Promise.all(workers);

    if (failed > 0 && deducted) {
      try {
        const refund = await refundCredits(userId, jobId, failed * costPerImage);
        balance = refund.balance;
      } catch (e) {
        console.error('runBatchGeneration: refund failed', e);
      }
    }

    const succeeded = entries.filter((r) => r.status === 'complete').length;
    const refunded = deducted ? failed * costPerImage : 0;

    await prisma.toolJob.update({
      where: { id: jobId },
      data: {
        status: failed === images.length ? 'FAILED' : 'COMPLETE',
        outputData: {
          results: entries,
          platform: targetPlatform,
          partial: false,
          succeeded,
          failed,
          refunded,
          balance,
        } as any,
        errorMessage: failed > 0 ? `${failed} image(s) failed` : undefined,
        completedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error('runBatchGeneration error:', err);
    // Unexpected failure: never leave the user charged for images that
    // did not complete, and never leave the job hanging in a live state.
    const notComplete = entries.filter((r) => r.status !== 'complete').length;
    if (notComplete > 0 && deducted) {
      try {
        const refund = await refundCredits(userId, jobId, notComplete * costPerImage);
        balance = refund.balance;
      } catch (refundErr) {
        console.error('runBatchGeneration: failure refund failed', refundErr);
      }
    }
    const succeeded = entries.filter((r) => r.status === 'complete').length;
    try {
      await prisma.toolJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          outputData: {
            results: entries,
            platform: targetPlatform,
            partial: false,
            succeeded,
            failed: notComplete,
            refunded: deducted ? notComplete * costPerImage : 0,
            balance,
          } as any,
          errorMessage: err?.message || 'generation_failed',
          completedAt: new Date(),
        },
      });
    } catch (updateErr) {
      console.error('runBatchGeneration: failed-status update failed', updateErr);
    }
  }
}
