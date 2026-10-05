import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { getGeneratorSettings } from '@/lib/generator/settings';
import { buildMetadataPrompt, buildRetrySystemPrompt } from '@/lib/generator/prompt';
import type { TargetPlatform } from '@/lib/generator/types';
import { generateWithAI } from '@/lib/ai';
import { MetadataSchema } from '@/lib/ai/schemas';
import { deductCredits, refundCredits } from '@/lib/credits/engine';
import { getToolCost } from '@/lib/credits/cost';

import { isUserApiKeyRequired, getUserAiKeysStatus } from '@/lib/ai/user-keys';

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
  let user: Awaited<ReturnType<typeof requireApiUser>>;
  try {
    user = await requireApiUser();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
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

  // Check if user API key is enforced
  const keyRequired = await isUserApiKeyRequired();
  if (keyRequired) {
    const keysStatus = await getUserAiKeysStatus(user.id);
    if (!keysStatus.hasAnyKey) {
      return new Response(
        sse({
          type: 'error',
          error: 'user_api_key_required',
          message: 'API Key is required. Please configure your API key in Settings to continue.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream' },
        },
      );
    }
  }

  const targetPlatform: TargetPlatform = platform || 'adobe';
  const settings = await getGeneratorSettings();
  const merged = { ...settings, ...(overrides || {}) };

  const costPerImage = await getToolCost('metadata-generator');
  const total = images.length * costPerImage;
  const deduction = await deductCredits(user.id, total, 'SPEND', {
    imageCount: images.length,
    costPerImage,
    toolSlug: 'metadata-generator',
    platform: targetPlatform,
  });

  if (!deduction.ok) {
    return new Response(sse({ type: 'error', error: 'insufficient_credits' }), {
      status: 402,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const job = await prisma.toolJob.create({
    data: {
      userId: user.id,
      toolSlug: 'metadata-generator',
      status: 'PROCESSING',
      inputFileUrls: images.map((i) => i.previewUrl),
      creditsCharged: total,
      outputData: {
        platform: targetPlatform,
        settings: merged,
        images: images.map((i) => ({ id: i.id, fileName: i.fileName })),
      } as any,
    },
  });

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

      const CONCURRENCY = 4;
      let currentIndex = 0;

      async function processNext() {
        while (currentIndex < images.length) {
          const img = images[currentIndex++];
          if (!img) break;

          await send({ type: 'processing', id: img.id });

          const entry: any = {
            id: img.id,
            fileName: img.fileName,
            status: 'failed',
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
              maxTokens: 8192,
              temperature: 0.7,
              userId: user.id,
            });

            let parsed: any = ai.parsed;
            if (!parsed) {
              const retrySys = buildRetrySystemPrompt({ settings: merged as any, platform: targetPlatform });
              ai = await generateWithAI({
                toolSlug: 'metadata-generator',
                systemPrompt: retrySys,
                userPrompt,
                imageUrls: [img.previewUrl],
                responseSchema: MetadataSchema,
                responseSchemaName: 'Metadata',
                maxTokens: 8192,
                temperature: 0.2,
                userId: user.id,
              });
              if (!ai.success && ai.errorMessage) throw new Error(ai.errorMessage);
              parsed = ai.parsed;
            }

            if (!ai.success && ai.errorMessage) throw new Error(ai.errorMessage);
            if (!parsed || typeof parsed.title !== 'string')
              throw new Error('Invalid AI response');

            const inclDesc = (merged as any).includeDescription !== false;
            entry.status = 'complete';
            entry.title = String(parsed.title).slice(0, merged.titleLength);
            entry.description = inclDesc ? String(parsed.description || '').slice(0, merged.descriptionLength) : '';
            entry.keywords = Array.isArray(parsed.keywords)
              ? parsed.keywords.map((k: any) => String(k)).slice(0, merged.keywordsCount)
              : [];
            entry.altText = String(parsed.altText || '');
            entry.provider = ai.provider;
            entry.model = ai.model;
            entry.tokensUsed = ai.usage.totalTokens;
          } catch (e: any) {
            failed += 1;
            entry.error = e?.message || 'generation_failed';
          }

          results.push(entry);
          await send({ type: 'result', result: entry });
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, images.length) },
        () => processNext(),
      );

      await Promise.all(workers);

      if (failed > 0) {
        try { await refundCredits(user.id, job.id, failed * costPerImage); }
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
        refunded: failed * costPerImage,
        jobId: job.id,
      });
    } catch (streamErr) {
      console.error('Streaming generation error:', streamErr);
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

