import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { deductCredits, getBalance, refundCredits } from '@/lib/credits/engine';
import { isInsufficientCreditsError } from '@/lib/credits/errors';
import { getToolCost } from '@/lib/credits/cost';
import { generateWithAI } from '@/lib/ai';
import { ImagePromptSchema } from '@/lib/ai/schemas';
import { downloadFile } from '@/lib/s3/client';
import { ownsStorageKey } from '@/lib/api/ownership';
import { resizeImage } from '@/lib/generator/images';
import { getPresetBySlug } from '@/lib/prompt-styles/presets';
import type { ImagePromptResult } from '@/lib/prompt-styles/types';
import {
  buildImagePromptSystemInstruction,
  buildImagePromptUserPrompt,
} from '@/lib/prompt-styles/prompt';

import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';

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
    const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(img.previewUrl);
    if (dataUrlMatch) {
      buf = Buffer.from(dataUrlMatch[2], 'base64');
    } else {
      const res = await fetch(img.previewUrl, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error('preview_fetch_failed');
      // 10MB cap — refuse to buffer huge responses into memory.
      const len = Number(res.headers.get('content-length') || 0);
      if (len > 10 * 1024 * 1024) throw new Error('preview_too_large');
      buf = Buffer.from(await res.arrayBuffer());
    }
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
  const { images, style } = body as { images?: PromptImage[]; style?: string };

  if (!Array.isArray(images) || images.length === 0) {
    return new Response(sse({ type: 'error', error: 'images_required' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
  if (images.length > 20) {
    return new Response(sse({ type: 'error', error: 'too_many_images' }), {
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
  const keyError = await requireUserApiKeyIfNeeded(user.id);
  if (keyError) {
    return new Response(sse({ type: 'error', ...keyError }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const preset = await getPresetBySlug(style);
  if (!preset) {
    return new Response(sse({ type: 'error', error: 'unknown_style' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  // H1: ownership check — client-supplied S3 keys must belong to this
  // user, otherwise one user can fetch another user's image bytes (IDOR).
  // Same helper as the tools routes (lib/api/ownership.ts).
  for (const img of images) {
    if (img.key && !ownsStorageKey(user.id, img.key)) {
      return new Response(sse({ type: 'error', error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
  }

  const costPerImage = await getToolCost(TOOL_SLUG);
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
      style: preset.slug,
      toolSlug: TOOL_SLUG,
    });
  } catch (e) {
    if (isInsufficientCreditsError(e)) {
      return new Response(sse({ type: 'error', error: 'insufficient_credits', balance: e.balance, needed: e.needed }), {
        status: 402,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    console.error('image-prompt stream: deduction failed', e);
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
        toolSlug: TOOL_SLUG,
        status: 'PROCESSING',
        inputFileUrls: images.map((i) => i.key || i.fileName || ''),
        creditsCharged: deduction.deducted === true ? total : 0,
        outputData: {
          style: preset.slug,
          styleLabel: preset.label,
          images: images.map((i) => ({ id: i.id, fileName: i.fileName })),
        } as any,
      },
    });
  } catch (jobErr) {
    // Total failure after deduction: refund so the user is never charged
    // for a run that never started. Skip in unlimited mode (nothing deducted).
    console.error('image-prompt stream: toolJob.create failed', jobErr);
    if (deduction.deducted === true) {
      try {
        await refundCredits(user.id, '', total, { toolSlug: TOOL_SLUG });
      } catch (refundErr) {
        console.error('image-prompt stream total-failure refund failed', refundErr);
      }
    }
    return new Response(sse({ type: 'error', error: 'generation_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const activePreset = preset;
  const promptImages = images;

  const systemPrompt = buildImagePromptSystemInstruction(activePreset.systemInstruction, false);
  const userPrompt = buildImagePromptUserPrompt({ strict: false });

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

            // Single pass: base.ts salvages truncated output automatically,
            // so no second "strict" pass is needed.
            const result = (
              await generateWithAI({
                toolSlug: TOOL_SLUG,
                systemPrompt,
                userPrompt,
                imageUrls: [imageUrl],
                responseSchema: ImagePromptSchema,
                responseSchemaName: 'ImagePrompt',
                // 1600 tokens is >2× a legitimate full JSON (~700); the old
                // 4000 let repetition loops burn most of the call's time.
                maxTokens: 1600,
                temperature: 0.7,
                userId: user.id,
              })
            ).parsed as ImagePromptResult | null;

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
            // M-B2: static error code — never leak raw internals to the client
            // (matches batch/stream's hardcoded 'generation_failed').
            entry.error = 'generation_failed';
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
      // Skip refund in unlimited mode — nothing was deducted, refunding
      // would mint phantom credits.
      if (failed > 0 && deduction.deducted === true) {
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
        // M-B3: only report refunded credits when something was actually
        // deducted — in unlimited mode the API must not claim refunds.
        refunded: deduction.deducted === true ? failed * costPerImage : 0,
        jobId: job.id,
      });
    } catch (streamErr) {
      console.error('Image prompt streaming error:', streamErr);
      // Always notify the client — otherwise the frontend hangs on loading forever.
      try {
        await writer.write(
          encoder.encode(sse({ type: 'error', error: 'stream_failed' }))
        );
      } catch {}
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