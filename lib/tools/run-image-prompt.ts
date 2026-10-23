import { prisma } from '@/lib/db';
import { generateWithAI } from '@/lib/ai';
import { ImagePromptSchema } from '@/lib/ai/schemas';
import { refundCredits } from '@/lib/credits/engine';
import { downloadFile } from '@/lib/s3/client';
import { resizeImage } from '@/lib/generator/images';
import type { ImagePromptResult, PromptStylePreset } from '@/lib/prompt-styles/types';
import {
  buildImagePromptSystemInstruction,
  buildImagePromptUserPrompt,
} from '@/lib/prompt-styles/prompt';

const TOOL_SLUG = 'image-to-prompt';

export interface PromptImage {
  id: string;
  fileName: string;
  key?: string;
  previewUrl?: string;
  mimeType?: string;
}

/**
 * Dashboard "Prompt Controls" settings (white background, camera
 * parameters, target prompt length, prefix/suffix, negative words).
 * Only the polling start route supplies these — the stream and
 * non-stream routes never pass controls, so their behavior is unchanged.
 */
export interface PromptControls {
  whiteBackground: boolean;
  cameraParameters: boolean;
  promptLength: number;
  prefixEnabled: boolean;
  prefixText: string;
  suffixEnabled: boolean;
  suffixText: string;
  negativeEnabled: boolean;
  negativeWords: string;
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

export interface RunImagePromptGenerationArgs {
  userId: string;
  jobId: string;
  images: PromptImage[];
  preset: PromptStylePreset;
  costPerImage: number;
  deduction: { deducted: boolean; balance: number };
  controls?: PromptControls;
}

/**
 * Background image-to-prompt runner (polling delivery).
 *
 * The worker loop is identical to the SSE stream route's — a pool of 4
 * workers, one single-pass AI call per image, same entry shape — but
 * instead of pushing SSE events it writes progress into the ToolJob row
 * after each image finishes, so the frontend can poll
 * `GET /api/generate/jobs/[jobId]`. SSE events never reached browsers
 * through the production proxy stack (jobs completed server-side while
 * the UI spun forever); plain request/response polling works everywhere.
 *
 * Entries land in `results` in completion order, exactly as the stream
 * route pushed them. Never throws — unexpected errors mark the job
 * FAILED and refund every image that did not complete.
 */
export async function runImagePromptGeneration(
  args: RunImagePromptGenerationArgs,
): Promise<void> {
  const { userId, jobId, images, preset, costPerImage, controls } = args;
  const deducted = args.deduction.deducted === true;
  let balance = args.deduction.balance;

  // Prompt Controls → extra system instruction lines. Absent controls
  // (any non-dashboard caller) leave the instruction exactly as before.
  const extraLines: string[] = [];
  if (controls?.whiteBackground) {
    extraLines.push(
      'Describe the subject as isolated on a pure, solid white background (#FFFFFF) with a clean studio product-photography look.',
    );
  }
  if (controls?.cameraParameters) {
    extraLines.push(
      'Include realistic camera parameters in the prompt: camera body style, lens focal length, aperture, and the lighting setup.',
    );
  }
  if (controls) {
    extraLines.push(
      `Aim for the main prompt text to be approximately ${controls.promptLength} characters long.`,
    );
  }
  const extraInstruction = extraLines.length > 0 ? extraLines.join('\n') : undefined;

  const systemPrompt = buildImagePromptSystemInstruction(
    preset.systemInstruction,
    false,
    extraInstruction,
  );
  const userPrompt = buildImagePromptUserPrompt({ strict: false });

  const results: any[] = [];
  let failed = 0;
  let refundedImages = 0;

  const writeProgress = async () => {
    try {
      await prisma.toolJob.update({
        where: { id: jobId },
        data: {
          outputData: {
            style: preset.slug,
            styleLabel: preset.label,
            results: [...results],
            partial: true,
          } as any,
        },
      });
    } catch (e) {
      // Progress writes are best-effort — the final update is authoritative.
      console.error('runImagePromptGeneration: progress update failed', e);
    }
  };

  try {
    const CONCURRENCY = 4;
    let currentIndex = 0;

    async function processNext() {
      while (currentIndex < images.length) {
        const img = images[currentIndex++];
        if (!img) break;

        const entry: any = {
          id: img.id,
          fileName: img.fileName,
          styleSlug: preset.slug,
          styleLabel: preset.label,
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
              userId,
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

          // Prompt Controls post-processing — deterministic, applied to
          // the finished prompt text rather than left to the model.
          if (controls?.prefixEnabled && controls.prefixText.trim()) {
            entry.prompt = `${controls.prefixText.trim()} ${entry.prompt}`;
          }
          if (controls?.suffixEnabled && controls.suffixText.trim()) {
            entry.prompt = `${entry.prompt} ${controls.suffixText.trim()}`;
          }
          if (controls?.negativeEnabled && controls.negativeWords.trim()) {
            entry.negativePrompt = controls.negativeWords.trim();
          }
        } catch (e: any) {
          failed += 1;
          // Static error code — never leak raw internals to the client
          // (matches the stream route's hardcoded 'generation_failed').
          entry.error = 'generation_failed';
        }

        results.push(entry);
        await writeProgress();
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, images.length) },
      () => processNext(),
    );

    await Promise.all(workers);

    // Skip refund in unlimited mode — nothing was deducted, refunding
    // would mint phantom credits.
    if (failed > 0 && deducted) {
      try {
        const refund = await refundCredits(userId, jobId, failed * costPerImage, {
          toolSlug: TOOL_SLUG,
        });
        balance = refund.balance;
        refundedImages = failed;
      } catch (e) {
        console.error('runImagePromptGeneration: refund failed', e);
      }
    }

    await prisma.toolJob.update({
      where: { id: jobId },
      data: {
        status: failed === images.length ? 'FAILED' : 'COMPLETE',
        outputData: {
          style: preset.slug,
          styleLabel: preset.label,
          results,
          partial: false,
          succeeded: images.length - failed,
          failed,
          // Only report refunded credits when something was actually
          // deducted — in unlimited mode the API must not claim refunds.
          refunded: deducted ? failed * costPerImage : 0,
          balance,
        } as any,
        errorMessage: failed > 0 ? `${failed} image(s) failed` : undefined,
        completedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error('runImagePromptGeneration error:', err);
    // Unexpected failure: never leave the user charged for images that
    // did not complete, and never leave the job hanging in a live state.
    const completeCount = results.filter((r) => r.status === 'complete').length;
    const notComplete = images.length - completeCount;
    if (notComplete > refundedImages && deducted) {
      try {
        const refund = await refundCredits(
          userId,
          jobId,
          (notComplete - refundedImages) * costPerImage,
          { toolSlug: TOOL_SLUG },
        );
        balance = refund.balance;
        refundedImages = notComplete;
      } catch (refundErr) {
        console.error('runImagePromptGeneration: failure refund failed', refundErr);
      }
    }
    try {
      await prisma.toolJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          outputData: {
            style: preset.slug,
            styleLabel: preset.label,
            results,
            partial: false,
            succeeded: completeCount,
            failed: notComplete,
            refunded: deducted ? refundedImages * costPerImage : 0,
            balance,
          } as any,
          errorMessage: err?.message || 'generation_failed',
          completedAt: new Date(),
        },
      });
    } catch (updateErr) {
      console.error('runImagePromptGeneration: failed-status update failed', updateErr);
    }
  }
}
