import { NextResponse } from 'next/server';
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
 */
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

  // Safety server-side downscale to max 1024px JPEG to minimize tokens
  try {
    const optimized = await resizeImage(buf, mime, 1024, 80);
    return { data: optimized.buffer.toString('base64'), mime: optimized.mime };
  } catch {
    return { data: buf.toString('base64'), mime };
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const { images, style } = body as { images?: PromptImage[]; style?: string };

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'images_required' }, { status: 400 });
    }
    if (!style) {
      return NextResponse.json({ error: 'style_required' }, { status: 400 });
    }

    // Check if user API key is enforced
    const keyRequired = await isUserApiKeyRequired();
    if (keyRequired) {
      const keysStatus = await getUserAiKeysStatus(user.id);
      if (!keysStatus.hasAnyKey) {
        return NextResponse.json(
          {
            error: 'user_api_key_required',
            message: 'API Key is required. Please configure your API key in Settings to continue.',
          },
          { status: 400 },
        );
      }
    }

    // Resolve the admin-configured preset. An unknown or disabled slug is
    // rejected rather than falling back, so a stale client can't smuggle in
    // its own system instruction.
    const preset = await getPresetBySlug(style);
    if (!preset) {
      return NextResponse.json({ error: 'unknown_style' }, { status: 400 });
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
      return NextResponse.json(
        { error: 'insufficient_credits', balance: deduction.balance, needed: total },
        { status: 402 },
      );
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

    const systemPrompt = buildImagePromptSystemInstruction(preset.systemInstruction);
    const strictSystem = buildImagePromptSystemInstruction(preset.systemInstruction, true);
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
    let balance = deduction.balance;
    if (failed > 0) {
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
      refunded: failed * costPerImage,
    });
  } catch (e: any) {
    console.error('image prompt generation failed', e);
    return NextResponse.json({ error: e?.message || 'generation_failed' }, { status: 500 });
  }
}
