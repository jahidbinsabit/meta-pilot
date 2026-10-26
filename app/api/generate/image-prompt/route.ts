import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
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
import {
  decodeDataImageUrl,
  fetchImageGuarded,
  normalizeOwnedImageRef,
} from '@/lib/net/safe-fetch';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TOOL_SLUG = 'image-to-prompt';

interface PromptImage {
  id: string;
  fileName: string;
  /** S3 object key, preferred — lets us pull bytes straight from S3. */
  key?: string;
  /** Fallback when only a public URL is available. */
  previewUrl?: string;
  mimeType?: string;
}

/**
 * Resolve an image to bare base64, which is what both provider adapters
 * expect (gemini.ts puts image.data straight into inline_data.data; openai.ts
 * builds a data: URL from it). Downscales to max 1024px and compresses to JPEG
 * to ensure fast generation and minimal token consumption.
 *
 * Reference resolution (H1/H2): a storage `key` is read directly (the
 * caller validated ownership above); a `previewUrl` is first checked as
 * an owned storage reference / data: URL via normalizeOwnedImageRef —
 * data: payloads are size-capped by decodeDataImageUrl — and only a
 * genuinely EXTERNAL http(s) URL (the Chrome-extension flow) is fetched,
 * through fetchImageGuarded (SSRF-safe: public-IP validation, manual
 * redirects, image-only, streamed size cap). A bare fetch here was the
 * old SSRF sink.
 */
async function toBase64(
  img: PromptImage,
  userId: string,
): Promise<{ data: string; mime: string }> {
  let mime = img.mimeType || 'image/png';
  let buf: Buffer;

  if (img.key) {
    buf = await downloadFile(img.key);
  } else if (img.previewUrl) {
    const ref = normalizeOwnedImageRef(userId, img.previewUrl);
    if (ref.ok && /^data:/i.test(ref.value)) {
      const decoded = decodeDataImageUrl(ref.value);
      if (!decoded) throw new Error('invalid_image_reference');
      buf = decoded.buffer;
      mime = decoded.mime;
    } else if (ref.ok) {
      // Owned storage reference normalized to its raw key.
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

  // Safety server-side downscale to max 1024px JPEG to minimize tokens
  try {
    const optimized = await resizeImage(buf, mime, 1024, 80);
    return { data: optimized.buffer.toString('base64'), mime: optimized.mime };
  } catch {
    return { data: buf.toString('base64'), mime };
  }
}

export async function POST(req: Request) {
  // Hoisted so the outer catch can refund on total failure.
  let userId = '';
  let total = 0;
  let deducted = false;
  try {
    const user = await requireApiUserOrKey(req, 'tools:run');
    userId = user.id;
    const body = await req.json();
    const { images, style } = body as { images?: PromptImage[]; style?: string };

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'images_required' }, { status: 400 });
    }
    if (images.length > 20) {
      return NextResponse.json({ error: 'too_many_images', max: 20 }, { status: 400 });
    }
    if (!style) {
      return NextResponse.json({ error: 'style_required' }, { status: 400 });
    }

    // Check if user API key is enforced
    const keyError = await requireUserApiKeyIfNeeded(user.id);
    if (keyError) {
      return NextResponse.json(keyError, { status: 400 });
    }

    // Resolve the admin-configured preset. An unknown or disabled slug is
    // rejected rather than falling back, so a stale client can't smuggle in
    // its own system instruction.
    const preset = await getPresetBySlug(style);
    if (!preset) {
      return NextResponse.json({ error: 'unknown_style' }, { status: 400 });
    }

    // H1: ownership check — client-supplied S3 keys must belong to this
    // user, otherwise one user can fetch another user's image bytes (IDOR).
    // Same helper as the tools routes (lib/api/ownership.ts).
    for (const img of images) {
      if (img.key && !ownsStorageKey(user.id, img.key)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }

    const costPerImage = await getToolCost(TOOL_SLUG);
    total = images.length * costPerImage;
    const charged = await chargeCredits(user.id, total, 'SPEND', {
      imageCount: images.length,
      costPerImage,
      style: preset.slug,
      toolSlug: TOOL_SLUG,
    });
    if (charged instanceof NextResponse) return charged;
    const deduction = charged;
    // Only refund when credits were actually taken (not unlimited mode).
    deducted = deduction.deducted === true;

    const job = await prisma.toolJob.create({
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

    const systemPrompt = buildImagePromptSystemInstruction(preset.systemInstruction);
    const userPrompt = buildImagePromptUserPrompt({});

    const results: any[] = [];
    let failed = 0;
    const CONCURRENCY = 2; // Process 2 images concurrently for ultra-fast generation

    const processImage = async (img: PromptImage) => {
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
        const { data, mime } = await toBase64(img, user.id);
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
        // M2: static error code — never leak raw internals per item.
        entry.error = 'generation_failed';
      }

      return entry;
    };

    // Process images in concurrent batches
    for (let i = 0; i < images.length; i += CONCURRENCY) {
      const chunk = images.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map((img) => processImage(img)));
      results.push(...chunkResults);
      if (i + CONCURRENCY < images.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Auto-refund every failed image — never charge for a failed generation.
    // Skip entirely in unlimited mode (deduction.deducted === false) —
    // refunding when nothing was deducted would mint phantom credits.
    let balance = deduction.balance;
    if (failed > 0 && deduction.deducted === true) {
      try {
        const refund = await refundCredits(user.id, job.id, failed * costPerImage, {
          toolSlug: TOOL_SLUG,
        });
        balance = refund.balance;
      } catch (e) {
        console.error('image-prompt refund failed', e);
      }
    }

    await prisma.toolJob.update({
      where: { id: job.id },
      data: {
        status: failed === images.length ? 'FAILED' : 'COMPLETE',
        outputData: { style: preset.slug, styleLabel: preset.label, results } as any,
        errorMessage: failed > 0 ? `${failed} image(s) failed` : undefined,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      jobId: job.id,
      results,
      succeeded: images.length - failed,
      failed,
      balance,
      refunded: deducted ? failed * costPerImage : 0,
    });
  } catch (e: any) {
    console.error('image prompt generation failed', e);
    // Total failure after deduction (e.g. toolJob.create threw): refund the
    // full amount. Never charge for a failure. Skip in unlimited mode
    // (nothing was deducted).
    if (userId && deducted && total > 0) {
      try {
        await refundCredits(userId, '', total, { toolSlug: TOOL_SLUG });
      } catch (refundErr) {
        console.error('image-prompt total-failure refund failed', refundErr);
      }
    }
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
  }
}
