import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { deductCredits, refundCredits } from '@/lib/credits/engine';
import { getToolCost } from '@/lib/credits/cost';
import { generateWithAI } from '@/lib/ai';
import { ImagePromptSchema } from '@/lib/ai/schemas';
import { downloadFile } from '@/lib/s3/client';
import { resizeImage } from '@/lib/generator/images';
import { getPresetBySlug } from '@/lib/prompt-styles/presets';
import type { ImagePromptResult } from '@/lib/prompt-styles/types';
import {
  buildImagePromptSystemInstruction,
  buildImagePromptUserPrompt,
} from '@/lib/prompt-styles/prompt';

import { isUserApiKeyRequired, getUserAiKeysStatus } from '@/lib/ai/user-keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const TOOL_SLUG = 'image-to-prompt';

interface PromptImage {
  id: string;
  fileName: string;
  key?: string;
  previewUrl?: string;
  mimeType?: string;
}

async function toBase64(img: PromptImage): Promise<{ data: string; mime: string }> {
  const mime = img.mimeType || 'image/png';
  let buf: Buffer;

  if (img.key) {
    buf = await downloadFile(img.key);
  } else if (img.previewUrl) {
    const res = await fetch(img.previewUrl);
    if (!res.ok) throw new Error('preview_fetch_failed');
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error('image_reference_required');
  }

  try {
    const optimized = await resizeImage(buf, mime, 1024, 80);
    return { data: optimized.buffer.toString('base64'), mime: optimized.mime };
  } catch {
    return { data: buf.toString('base64'), mime };
  }
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof requireApiUser>>;
  try {
    user = await requireApiUser(req);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { images, style } = body as { images?: PromptImage[]; style?: string };

  if (!Array.isArray(images) || images.length === 0) {
    return new Response(sse({ type: 'error', error: 'images_required' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
  if (!style) {
    return new Response(sse({ type: 'error', error: 'style_required' }), {
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

  const preset = await getPresetBySlug(style);
  if (!preset) {
    return new Response(sse({ type: 'error', error: 'unknown_style' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const costPerImage = await getToolCost(TOOL_SLUG);
  const total = images.length * costPerImage;
  const deduction = await deductCredits(user.id, total, 'SPEND', {
    imageCount: images.length,
    costPerImage,
    style: preset.slug,
    toolSlug: TOOL_SLUG,
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
      toolSlug: TOOL_SLUG,
      status: 'PROCESSING',
      inputFileUrls: images.map((i) => i.previewUrl || i.key || ''),
      creditsCharged: total,
      outputData: {
        style: preset.slug,
        styleLabel: preset.label,
        images: images.map((i) => ({ id: i.id, fileName: i.fileName })),
      } as any,
    },
  });

  const activePreset = preset;
  const promptImages = images;

  const systemPrompt = buildImagePromptSystemInstruction(activePreset.systemInstruction, false);
  const userPrompt = buildImagePromptUserPrompt({ strict: false });
  const strictSystem = buildImagePromptSystemInstruction(activePreset.systemInstruction, true);

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
      await send({ type: 'init', total: promptImages.length, jobId: job.id });

      const CONCURRENCY = 4;
      let currentIndex = 0;

      async function processNext() {
        while (currentIndex < promptImages.length) {
          const img = promptImages[currentIndex++];
          if (!img) break;

          await send({ type: 'processing', id: img.id });

          const entry: any = {
            id: img.id,
            fileName: img.fileName,
            styleSlug: activePreset.slug,
            styleLabel: activePreset.label,
            status: 'failed',
            prompt: '',
            subject: '',
            style: '',
            lighting: '',
            composition: '',
            mood: '',
          };

          try {
            const { data, mime } = await toBase64(img);
            const imageUrl = `data:${mime};base64,${data}`;

            let result = (
              await generateWithAI({
                toolSlug: TOOL_SLUG,
                systemPrompt,
                userPrompt,
                imageUrls: [imageUrl],
                responseSchema: ImagePromptSchema,
                responseSchemaName: 'ImagePrompt',
                maxTokens: 8192,
                temperature: 0.7,
                userId: user.id,
              })
            ).parsed as ImagePromptResult | null;

            if (!result) {
              result = (
                await generateWithAI({
                  toolSlug: TOOL_SLUG,
                  systemPrompt: strictSystem,
                  userPrompt: buildImagePromptUserPrompt({ strict: true }),
                  imageUrls: [imageUrl],
                  responseSchema: ImagePromptSchema,
                  responseSchemaName: 'ImagePrompt',
                  maxTokens: 8192,
                  temperature: 0.2,
                  userId: user.id,
                })
              ).parsed as ImagePromptResult | null;
            }

            if (!result) throw new Error('malformed_response');

            entry.status = 'complete';
            entry.prompt = result.prompt;
            entry.subject = result.subject;
            entry.style = result.style;
            entry.lighting = result.lighting;
            entry.composition = result.composition;
            entry.mood = result.mood;
          } catch (e: any) {
            failed += 1;
            entry.error = e?.message || 'generation_failed';
          }

          results.push(entry);
          await send({ type: 'result', result: entry });
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, promptImages.length) },
        () => processNext(),
      );

      await Promise.all(workers);

      let balance = deduction.balance;
      if (failed > 0) {
        try {
          const refund = await refundCredits(user.id, job.id, failed * costPerImage, {
            toolSlug: TOOL_SLUG,
          });
          balance = refund.balance;
        } catch (e) {
          console.error('image-prompt stream refund failed', e);
        }
      }

      await prisma.toolJob.update({
        where: { id: job.id },
        data: {
          status: failed === promptImages.length ? 'FAILED' : 'COMPLETE',
          outputData: { style: activePreset.slug, styleLabel: activePreset.label, results } as any,
          errorMessage: failed > 0 ? `${failed} image(s) failed` : undefined,
          completedAt: new Date(),
        },
      });

      await send({
        type: 'done',
        succeeded: promptImages.length - failed,
        failed,
        balance,
        refunded: failed * costPerImage,
        jobId: job.id,
      });
    } catch (streamErr) {
      console.error('Image prompt streaming error:', streamErr);
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