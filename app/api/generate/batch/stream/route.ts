import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { getGeneratorSettings } from '@/lib/generator/settings';
import { buildMetadataBatchPrompt, buildRetryBatchSystemPrompt } from '@/lib/generator/prompt';
import type { TargetPlatform } from '@/lib/generator/types';
import { generateWithAI } from '@/lib/ai';
import { MetadataBatchSchema } from '@/lib/ai/schemas';
import { deductCredits, getBalance, refundCredits } from '@/lib/credits/engine';
import { isInsufficientCreditsError } from '@/lib/credits/errors';
import { getToolCost } from '@/lib/credits/cost';

import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

interface BatchImage {
  id: string;
  fileName: string;
  previewUrl: string;
  description: string;
  mimeType: string;
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof requireApiUserOrKey>>;
  try {
    user = await requireApiUserOrKey(req, 'tools:run');
  } catch {
    return new Response(sse({ type: 'error', error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(sse({ type: 'error', error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
  const { images, settings: overrides, platform = 'adobe' } = body as {
    images: BatchImage[];
    settings?: Partial<Record<string, unknown>>;
    platform?: TargetPlatform;
  };

  if (!Array.isArray(images) || images.length === 0) {
    return new Response(sse({ type: 'error', error: 'images_required' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  // Validate maximum batch size BEFORE deducting credits — unbounded batches
  // hit the 300s timeout and leave credits unrefunded. Mirrors batch/route.ts.
  const MAX_BATCH_SIZE = 100;
  if (images.length > MAX_BATCH_SIZE) {
    return new Response(
      sse({ type: 'error', error: 'batch_too_large', max: MAX_BATCH_SIZE, received: images.length }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  // Check if user API key is enforced
  const keyError = await requireUserApiKeyIfNeeded(user.id);
  if (keyError) {
    return new Response(sse({ type: 'error', ...keyError }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const targetPlatform: TargetPlatform = platform || 'adobe';
  const settings = await getGeneratorSettings();
  const merged = { ...settings, ...(overrides || {}) };

  const costPerImage = await getToolCost('metadata-generator');
  const total = images.length * costPerImage;
  let deduction;
  // M1: zero total (admin set the tool free) — skip deduction entirely;
  // deductCredits rejects amount <= 0, which would 402 a free tool.
  if (total <= 0) {
    deduction = { ok: true, deducted: false, balance: await getBalance(user.id) };
  } else
  try {
    deduction = await deductCredits(user.id, total, 'SPEND', {
      imageCount: images.length,
      costPerImage,
      toolSlug: 'metadata-generator',
      platform: targetPlatform,
    });
  } catch (e) {
    if (isInsufficientCreditsError(e)) {
      return new Response(sse({ type: 'error', error: 'insufficient_credits', balance: e.balance, needed: e.needed }), {
        status: 402,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    console.error('batch stream: deduction failed', e);
    return new Response(sse({ type: 'error', error: 'deduction_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  if (!deduction.ok) {
    return new Response(sse({ type: 'error', error: 'insufficient_credits' }), {
      status: 402,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  let job: Awaited<ReturnType<typeof prisma.toolJob.create>>;
  try {
    job = await prisma.toolJob.create({
      data: {
        userId: user.id,
        toolSlug: 'metadata-generator',
        status: 'PROCESSING',
        inputFileUrls: images.map((i) => i.previewUrl),
        creditsCharged: deduction.deducted === true ? total : 0,
        outputData: {
          platform: targetPlatform,
          settings: merged,
          images: images.map((i) => ({ id: i.id, fileName: i.fileName })),
        } as any,
      },
    });
  } catch (jobErr) {
    // Total failure after deduction: refund so the user is never charged
    // for a batch that never ran. Skip in unlimited mode (nothing deducted).
    console.error('batch stream: toolJob.create failed', jobErr);
    if (deduction.deducted === true) {
      try {
        await refundCredits(user.id, '', total, { toolSlug: 'metadata-generator' });
      } catch (refundErr) {
        console.error('batch stream total-failure refund failed', refundErr);
      }
    }
    return new Response(sse({ type: 'error', error: 'batch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const encoder = new TextEncoder();
  const results: any[] = [];
  let failed = 0;

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();

  (async () => {
    try {
      const send = async (data: unknown) => {
        try {
          await writer.write(encoder.encode(sse(data)));
        } catch {
          // Client disconnected
        }
      };

      // 2KB padding comment to defeat proxy / browser buffering threshold immediately
      await writer.write(encoder.encode(`: ${' '.repeat(2048)}\n\n`));
      await send({ type: 'init', total: images.length, jobId: job.id });

      // Multi-image batching: up to 5 images go in ONE AI call (the free-tier
      // Gemini quota is 15 requests/min — one call per image burned it and
      // triggered 429 retry storms). 3 groups run concurrently.
      const GROUP_SIZE = 5;
      const GROUP_CONCURRENCY = 3;

      const groups: BatchImage[][] = [];
      for (let i = 0; i < images.length; i += GROUP_SIZE) {
        groups.push(images.slice(i, i + GROUP_SIZE));
      }

      let currentGroup = 0;

      async function processGroup() {
        while (currentGroup < groups.length) {
          const group = groups[currentGroup++];
          if (!group) break;

          for (const img of group) {
            await send({ type: 'processing', id: img.id });
          }

          const entries: any[] = group.map((img) => ({
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

            let parsed: any = ai.parsed;
            if (!parsed) {
              // Retry the whole group once with a stricter JSON-only prompt.
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
            group.forEach((img, i) => {
              const r = byIndex.get(i + 1);
              if (!r || typeof r.title !== 'string') return;
              const entry = entries[i];
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

          for (const entry of entries) {
            if (entry.status !== 'complete') {
              failed += 1;
              entry.error = 'generation_failed';
            }
            results.push(entry);
            await send({ type: 'result', result: entry });
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(GROUP_CONCURRENCY, groups.length) },
        () => processGroup(),
      );

      await Promise.all(workers);

      if (failed > 0 && deduction.deducted === true) {
        try {
          const refund = await refundCredits(user.id, job.id, failed * costPerImage);
          deduction.balance = refund.balance;
        }
        catch (e) { console.error('stream refund failed', e); }
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

      await send({
        type: 'done',
        succeeded: results.filter((r) => r.status === 'complete').length,
        failed,
        balance: deduction.balance,
        refunded: deduction.deducted === true ? failed * costPerImage : 0,
        jobId: job.id,
      });
    } catch (streamErr) {
      console.error('Streaming generation error:', streamErr);
      // M5: notify the frontend of a mid-stream failure instead of just
      // closing the stream — without this error event the UI keeps
      // waiting for a 'done' that never arrives.
      try {
        await writer.write(
          encoder.encode(sse({ type: 'error', error: 'generation_failed' })),
        );
      } catch {
        // Client already disconnected — nothing to notify.
      }
    } finally {
      try {
        await writer.close();
      } catch {}
    }
  })();

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

