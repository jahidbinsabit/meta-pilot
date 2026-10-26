import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { getGeneratorSettings } from '@/lib/generator/settings';
import { runBatchGeneration, type BatchImage } from '@/lib/generator/run-batch';
import type { TargetPlatform } from '@/lib/generator/types';
import { deductCredits, getBalance, refundCredits } from '@/lib/credits/engine';
import { isInsufficientCreditsError } from '@/lib/credits/errors';
import { getToolCost } from '@/lib/credits/cost';

import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeOwnedImageRef } from '@/lib/net/safe-fetch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Start a metadata batch job and return immediately with its jobId.
 *
 * The preamble (auth, validation, API-key gate, credit deduction, job
 * creation) mirrors the original non-stream batch route (deleted in the
 * R7 cleanup); the difference is
 * delivery: generation runs detached via `runBatchGeneration`, which
 * writes progress into the ToolJob row, and the frontend polls
 * `GET /api/generate/jobs/[jobId]`. SSE events never reached browsers
 * through the production proxy stack, while plain request/response
 * works reliably.
 */
export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof requireApiUserOrKey>>;
  try {
    user = await requireApiUserOrKey(req, 'tools:run');
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // M1: per-user rate limit on job starts (generation is the most
  // expensive surface in the app). Generous for real batch workflows;
  // the limiter counts attempts, so it is checked before any deduction.
  const rl = rateLimit(`generate-batch-start:${user.id}`, {
    max: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { images, settings: overrides, platform = 'adobe' } = body as {
    images: BatchImage[];
    settings?: Partial<Record<string, unknown>>;
    platform?: TargetPlatform;
  };

  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: 'images_required' }, { status: 400 });
  }

  // Validate maximum batch size BEFORE deducting credits — unbounded
  // batches leave credits unrefunded.
  const MAX_BATCH_SIZE = 100;
  if (images.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: 'batch_too_large', max: MAX_BATCH_SIZE, received: images.length },
      { status: 400 },
    );
  }

  // H1/H2: every image reference must be the caller's OWN storage object
  // (raw key, /api/s3/<key> URL, or local /uploads/<flat> URL — all
  // normalized to the canonical raw key) or a data: image within the
  // size cap. Anything else (another user's key, an external URL, an
  // internal address) rejects the WHOLE request before any job exists
  // or any credit moves — the AI adapters resolve whatever they are
  // handed, so the entry point is where ownership is enforced.
  const validatedImages: BatchImage[] = [];
  for (const img of images) {
    const ref = normalizeOwnedImageRef(user.id, img?.previewUrl);
    if (!ref.ok) {
      return NextResponse.json(
        { error: 'invalid_image_reference' },
        { status: 400 },
      );
    }
    validatedImages.push({ ...img, previewUrl: ref.value });
  }

  // Check if user API key is enforced
  const keyError = await requireUserApiKeyIfNeeded(user.id);
  if (keyError) {
    return NextResponse.json(keyError, { status: 400 });
  }

  const targetPlatform: TargetPlatform = platform || 'adobe';
  const settings = await getGeneratorSettings();
  const merged = { ...settings, ...(overrides || {}) };
  // Adobe Stock has no description field (title + keywords only) — never
  // generate one for Adobe, regardless of the saved preference.
  if (targetPlatform === 'adobe') merged.includeDescription = false;

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
      return NextResponse.json(
        { error: 'insufficient_credits', balance: e.balance, needed: e.needed },
        { status: 402 },
      );
    }
    console.error('batch start: deduction failed', e);
    return NextResponse.json({ error: 'deduction_failed' }, { status: 500 });
  }

  if (!deduction.ok) {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }

  let job: Awaited<ReturnType<typeof prisma.toolJob.create>>;
  try {
    job = await prisma.toolJob.create({
      data: {
        userId: user.id,
        toolSlug: 'metadata-generator',
        inputFileUrls: validatedImages.map((i) => i.previewUrl),
        creditsCharged: deduction.deducted === true ? total : 0,
        outputData: {
          platform: targetPlatform,
          settings: merged,
          images: validatedImages.map((i) => ({ id: i.id, fileName: i.fileName })),
        } as any,
      },
    });
  } catch (jobErr) {
    // Total failure after deduction: refund so the user is never charged
    // for a batch that never ran. Skip in unlimited mode (nothing deducted).
    console.error('batch start: toolJob.create failed', jobErr);
    if (deduction.deducted === true) {
      try {
        await refundCredits(user.id, '', total, { toolSlug: 'metadata-generator' });
      } catch (refundErr) {
        console.error('batch start total-failure refund failed', refundErr);
      }
    }
    return NextResponse.json({ error: 'batch_failed' }, { status: 500 });
  }

  // Detached: generation continues in the background and reports
  // progress through the ToolJob row. runBatchGeneration never throws.
  void runBatchGeneration({
    userId: user.id,
    jobId: job.id,
    images: validatedImages,
    mergedSettings: merged,
    platform: targetPlatform,
    costPerImage,
    deduction: {
      deducted: deduction.deducted === true,
      balance: deduction.balance,
    },
  });

  return NextResponse.json({ jobId: job.id, total: images.length });
}
