import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
import { getToolCost } from '@/lib/credits/cost';
import { generateWithAI } from '@/lib/ai';
import { ImagePromptSchema } from '@/lib/ai/schemas';
import { ownsStorageKey } from '@/lib/api/ownership';
import { getPresetBySlug } from '@/lib/prompt-styles/presets';
import { toBase64, type PromptImage } from '@/lib/tools/run-image-prompt';
import type { ImagePromptResult } from '@/lib/prompt-styles/types';
import {
  buildImagePromptSystemInstruction,
  buildImagePromptUserPrompt,
} from '@/lib/prompt-styles/prompt';

import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';
import { UNIVERSAL_BATCH_LIMIT } from '@/lib/generator/limits';
import { assertToolRunnable, toolGateErrorResponse } from '@/lib/tools/gate';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TOOL_SLUG = 'image-to-prompt';

export async function POST(req: Request) {
  // Hoisted so the outer catch can refund on total failure.
  let userId = '';
  let total = 0;
  let deducted = false;
  try {
    const user = await requireApiUserOrKey(req, 'tools:run');
    userId = user.id;

    // R9 S9-04: per-user rate limit — this synchronous sibling of the
    // start route had none; match it exactly (30 starts / 10 min).
    const rl = rateLimit(`generate-image-prompt:${user.id}`, {
      max: 30,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

    const body = await req.json();
    const { images, style } = body as { images?: PromptImage[]; style?: string };

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'images_required' }, { status: 400 });
    }
    // Shared product policy ceiling (100), same as the start route (T2-01).
    if (images.length > UNIVERSAL_BATCH_LIMIT) {
      return NextResponse.json(
        { error: 'too_many_images', max: UNIVERSAL_BATCH_LIMIT },
        { status: 400 },
      );
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

    // R9 B9-06/S9-01: registry gate before any charge — this route is
    // the Chrome extension's execution path for 'image-to-prompt', so
    // it must honour an admin disable / tier restriction too. The gate
    // response returns directly (never into the refund catch below).
    try {
      await assertToolRunnable(TOOL_SLUG, user);
    } catch (e) {
      const gateRes = toolGateErrorResponse(e);
      if (gateRes) return gateRes;
      throw e;
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
