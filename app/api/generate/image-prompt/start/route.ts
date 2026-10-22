import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { deductCredits, getBalance, refundCredits } from '@/lib/credits/engine';
import { isInsufficientCreditsError } from '@/lib/credits/errors';
import { getToolCost } from '@/lib/credits/cost';
import { ownsStorageKey } from '@/lib/api/ownership';
import { getPresetBySlug } from '@/lib/prompt-styles/presets';
import {
  runImagePromptGeneration,
  type PromptImage,
} from '@/lib/tools/run-image-prompt';

import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const TOOL_SLUG = 'image-to-prompt';

/**
 * Start an image-to-prompt job and return immediately with its jobId.
 *
 * The preamble (auth, validation, API-key gate, preset lookup, ownership
 * check, credit deduction, job creation) is identical to the SSE stream
 * route, and the error shapes mirror the non-stream JSON route; the
 * difference is delivery: generation runs detached via
 * `runImagePromptGeneration`, which writes progress into the ToolJob
 * row, and the frontend polls `GET /api/generate/jobs/[jobId]`. SSE
 * events never reached browsers through the production proxy stack,
 * while plain request/response works reliably.
 */
export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof requireApiUserOrKey>>;
  try {
    user = await requireApiUserOrKey(req, 'tools:run');
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
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
      return NextResponse.json(
        { error: 'insufficient_credits', balance: e.balance, needed: e.needed },
        { status: 402 },
      );
    }
    console.error('image-prompt start: deduction failed', e);
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
    console.error('image-prompt start: toolJob.create failed', jobErr);
    if (deduction.deducted === true) {
      try {
        await refundCredits(user.id, '', total, { toolSlug: TOOL_SLUG });
      } catch (refundErr) {
        console.error('image-prompt start total-failure refund failed', refundErr);
      }
    }
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
  }

  // Detached: generation continues in the background and reports
  // progress through the ToolJob row. runImagePromptGeneration never throws.
  void runImagePromptGeneration({
    userId: user.id,
    jobId: job.id,
    images,
    preset,
    costPerImage,
    deduction: {
      deducted: deduction.deducted === true,
      balance: deduction.balance,
    },
  });

  return NextResponse.json({ jobId: job.id, total: images.length });
}
