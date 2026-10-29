import { prisma } from '@/lib/db';
import { generateWithAI } from '@/lib/ai';
import { ImagePromptSchema } from '@/lib/ai/schemas';
import { refundCreditsOnce } from '@/lib/credits/engine';
import { downloadFile } from '@/lib/s3/client';
import {
  decodeDataImageUrl,
  fetchImageGuarded,
  normalizeOwnedImageRef,
} from '@/lib/net/safe-fetch';
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
 * Only the polling start route supplies these — the non-stream route
 * never passes controls, so its behavior is unchanged.
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

export async function toBase64(
  img: PromptImage,
  userId: string,
): Promise<{ data: string; mime: string }> {
  let mime = img.mimeType || 'image/png';
  let buf: Buffer;

  if (img.key) {
    buf = await downloadFile(img.key);
  } else if (img.previewUrl) {
    // H1/H2: references arrive ownership-validated + normalized from the
    // start route, but resolve defensively anyway — an owned reference
    // is read from storage, a data: URL is decoded under the size cap,
    // and only a genuinely external http(s) URL is fetched, through the
    // SSRF-guarded fetcher (the old bare fetch followed redirects to
    // internal addresses and capped size by Content-Length alone, and
    // the data: branch had no cap at all).
    const ref = normalizeOwnedImageRef(userId, img.previewUrl);
    if (ref.ok && /^data:/i.test(ref.value)) {
      const decoded = decodeDataImageUrl(ref.value);
      if (!decoded) throw new Error('invalid_image_reference');
      buf = decoded.buffer;
      mime = decoded.mime;
    } else if (ref.ok) {
      buf = await downloadFile(ref.value);
    } else if (/^https?:\/\//i.test(img.previewUrl)) {
      const fetched = await fetchImageGuarded(img.previewUrl);
      buf = fetched.buffer;
      mime = fetched.contentType;
    } else {
      throw new Error('invalid_image_reference');
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
 * Worker loop: a pool of 4
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
    const n = controls.promptLength;
    extraLines.push(
      `The main prompt text must be approximately ${n} characters long (between ${Math.round(n * 0.9)} and ${Math.round(n * 1.1)} characters). Reach that length with concrete visual detail — never repetition or filler.`,
    );
  }
  const extraInstruction = extraLines.length > 0 ? extraLines.join('\n') : undefined;

  const systemPrompt = buildImagePromptSystemInstruction(
    preset.systemInstruction,
    false,
    extraInstruction,
  );
  const userPrompt = buildImagePromptUserPrompt({
    strict: false,
    targetChars: controls?.promptLength,
  });

  const results: any[] = [];
  let failed = 0;
  let refundedImages = 0;
  // CQ-03: `refundedTotal` sums only amounts ACTUALLY returned by refund
  // calls in this run; `refundError` records an attempted-but-failed refund
  // so the job never claims money it didn't move.
  let refundedTotal = 0;
  let refundError: string | undefined;

  // R9 H5: progress writes are throttled to one per ~2 s. The full
  // cumulative `results` blob used to be rewritten after EVERY image
  // (up to 100 full writes per job). `results` is written wholesale
  // on every admitted write, so a skipped write loses nothing — the
  // next admitted write carries every entry, and the terminal writes
  // are separate updateMany calls that always run. heartbeatAt rides
  // along on each admitted write, so it can lag at most one throttle
  // interval (~2 s) — far inside the stale-job reaper's 20-minute
  // window, the only consumer of heartbeat freshness.
  const PROGRESS_WRITE_MIN_INTERVAL_MS = 2000;
  let lastProgressWriteAt = 0;

  const writeProgress = async () => {
    const now = Date.now();
    if (now - lastProgressWriteAt < PROGRESS_WRITE_MIN_INTERVAL_MS) return;
    lastProgressWriteAt = now;
    try {
      // Status-guarded (R7-01): only a still-running job accepts progress.
      // If the stale-job reaper already claimed this job (FAILED +
      // refunded), a late progress write must not overwrite its
      // outputData — that would erase the reaper's refund record.
      await prisma.toolJob.updateMany({
        where: { id: jobId, status: 'PROCESSING' },
        data: {
          outputData: {
            style: preset.slug,
            styleLabel: preset.label,
            results: [...results],
            partial: true,
            // ToolJob has no updatedAt column — this heartbeat is what the
            // cleanup cron's stale-job reaper reads to tell a live job
            // (progress within 20 min) from an orphaned one.
            heartbeatAt: new Date().toISOString(),
          } as any,
        },
      });
    } catch (e) {
      // Progress writes are best-effort — the final update is authoritative.
      console.error('runImagePromptGeneration: progress update failed', e);
    }
  };

  // Refresh the local balance after a refund (refundCreditsOnce returns
  // only the amount). Cosmetic — a failure here never masks the refund.
  const refreshBalance = async () => {
    try {
      const walletBalance = await prisma.creditWallet.findUnique({
        where: { userId },
        select: { balance: true },
      });
      if (walletBalance) balance = walletBalance.balance;
    } catch {
      // Keep the last known balance.
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
          const { data, mime } = await toBase64(img, userId);
          const imageUrl = `data:${mime};base64,${data}`;

          // 1600 tokens is >2× a legitimate full JSON (~700); the old
          // 4000 let repetition loops burn most of the call's time. The
          // cap scales up modestly when the user asks for a long prompt.
          const maxTokens = controls
            ? Math.min(2400, Math.max(1600, Math.round(controls.promptLength * 0.9)))
            : 1600;
          const callModel = async (correction?: string) =>
            (
              await generateWithAI({
                toolSlug: TOOL_SLUG,
                systemPrompt,
                userPrompt: correction ? `${userPrompt}\n\n${correction}` : userPrompt,
                imageUrls: [imageUrl],
                responseSchema: ImagePromptSchema,
                responseSchemaName: 'ImagePrompt',
                maxTokens,
                temperature: 0.7,
                userId,
              })
            ).parsed as ImagePromptResult | null;

          let result = await callModel();
          if (!result) throw new Error('malformed_response');

          // Length enforcement: a soft instruction alone landed wherever
          // the model's habits pushed it, so measure the main prompt and
          // give the model ONE corrective retry when it lands well
          // outside the user's target (band wider than the ±10% asked
          // for, so only real outliers pay for a second call).
          const target = controls?.promptLength;
          if (
            target &&
            (result.prompt.length < target * 0.8 || result.prompt.length > target * 1.25)
          ) {
            const prev = result.prompt.length;
            const longer = prev < target;
            const correction =
              `LENGTH CORRECTION: your previous prompt was ${prev} characters, but it must be approximately ${target} characters (between ${Math.round(target * 0.9)} and ${Math.round(target * 1.1)}). ` +
              (longer
                ? 'Write a LONGER version that still covers the full detail checklist — add concrete visual specifics (exact colors, materials, light behavior, camera choices), never repetition or filler.'
                : 'Write a SHORTER version that still covers the full detail checklist — tighten the phrasing and drop the least important specifics.');
            try {
              const retry = await callModel(correction);
              if (retry) result = retry;
            } catch {
              // Keep the first result — a length miss beats a failure.
            }
          }

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
          // Static error code — never leak raw internals to the client.
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
        // Idempotent per job (CQ-02): if this refund was already paid —
        // e.g. the stale-job reaper got here first — it returns 0 and
        // writes nothing instead of paying twice.
        refundedTotal += await refundCreditsOnce(
          userId,
          failed * costPerImage,
          jobId,
          'image_prompt_partial_failure',
        );
        refundedImages = failed;
        await refreshBalance();
      } catch (e) {
        // CQ-03: record the failure — the final write below must not
        // claim these credits were refunded.
        refundError = 'refund_failed';
        console.error('runImagePromptGeneration: refund failed', e);
      }
    }

    // R7-01: the terminal write is status-guarded. If the stale-job
    // reaper claimed this job while a long group chain was stalled
    // (FAILED + refunded via refundCreditsOnce — the refund above then
    // dedupes to 0), this runner must NOT flip it back to COMPLETE or
    // overwrite the reaper's refund fields; skip the write entirely.
    const finalWrite = await prisma.toolJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data: {
        status: failed === images.length ? 'FAILED' : 'COMPLETE',
        outputData: {
          style: preset.slug,
          styleLabel: preset.label,
          results,
          partial: false,
          succeeded: images.length - failed,
          failed,
          // Only ACTUAL refunded amounts are reported (CQ-03) — and in
          // unlimited mode nothing was deducted, so nothing is claimed.
          refunded: refundedTotal,
          ...(refundError ? { refundError } : {}),
          balance,
        } as any,
        errorMessage: failed > 0 ? `${failed} image(s) failed` : undefined,
        completedAt: new Date(),
      },
    });
    if (finalWrite.count === 0) {
      console.error(
        'runImagePromptGeneration: job already claimed by the reaper — final write skipped',
        jobId,
      );
    }
  } catch (err: any) {
    console.error('runImagePromptGeneration error:', err);
    // Unexpected failure: never leave the user charged for images that
    // did not complete, and never leave the job hanging in a live state.
    const completeCount = results.filter((r) => r.status === 'complete').length;
    const notComplete = images.length - completeCount;
    if (notComplete > refundedImages && deducted) {
      try {
        // refundCreditsOnce is CUMULATIVE: pass the TOTAL owed for the
        // job (all not-complete images), not a delta — it subtracts
        // whatever was already refunded for this job (by this runner's
        // main path or by the reaper) and pays only the difference.
        refundedTotal += await refundCreditsOnce(
          userId,
          notComplete * costPerImage,
          jobId,
          'image_prompt_failure',
        );
        refundedImages = notComplete;
        await refreshBalance();
      } catch (refundErr) {
        refundError = 'refund_failed';
        console.error('runImagePromptGeneration: failure refund failed', refundErr);
      }
    }
    try {
      // Status-guarded like the success path (R7-01) — a reaped job
      // keeps the reaper's FAILED state and refund record.
      const failWrite = await prisma.toolJob.updateMany({
        where: { id: jobId, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          outputData: {
            style: preset.slug,
            styleLabel: preset.label,
            results,
            partial: false,
            succeeded: completeCount,
            failed: notComplete,
            refunded: refundedTotal,
            ...(refundError ? { refundError } : {}),
            balance,
          } as any,
          errorMessage: err?.message || 'generation_failed',
          completedAt: new Date(),
        },
      });
      if (failWrite.count === 0) {
        console.error(
          'runImagePromptGeneration: job already claimed by the reaper — failure write skipped',
          jobId,
        );
      }
    } catch (updateErr) {
      console.error('runImagePromptGeneration: failed-status update failed', updateErr);
    }
  }
}
