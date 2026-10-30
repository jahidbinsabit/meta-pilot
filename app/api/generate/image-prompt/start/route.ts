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
  type PromptControls,
  type PromptImage,
} from '@/lib/tools/run-image-prompt';

import { requireUserApiKeyIfNeeded } from '@/lib/ai/user-keys';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeOwnedImageRef } from '@/lib/net/safe-fetch';
import { UNIVERSAL_BATCH_LIMIT } from '@/lib/generator/limits';
import { assertToolRunnable, toolGateErrorResponse } from '@/lib/tools/gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const TOOL_SLUG = 'image-to-prompt';

/**
 * Defensively parse the dashboard "Prompt Controls" payload: booleans
 * must be literally true, strings default to '', and promptLength is
 * clamped to the slider range (200..2000, default 600).
 */
function parsePromptControls(raw: unknown): PromptControls {
  const c =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown) => v === true;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const promptLength =
    typeof c.promptLength === 'number' && Number.isFinite(c.promptLength)
      ? Math.min(2000, Math.max(200, Math.round(c.promptLength)))
      : 600;
  return {
    whiteBackground: bool(c.whiteBackground),
    cameraParameters: bool(c.cameraParameters),
    promptLength,
    prefixEnabled: bool(c.prefixEnabled),
    prefixText: str(c.prefixText),
    suffixEnabled: bool(c.suffixEnabled),
    suffixText: str(c.suffixText),
    negativeEnabled: bool(c.negativeEnabled),
    negativeWords: str(c.negativeWords),
  };
}

/**
 * Start an image-to-prompt job and return immediately with its jobId.
 *
 * The preamble (auth, validation, API-key gate, preset lookup, ownership
 * check, credit deduction, job creation) mirrors the original stream
 * route (deleted in the R7 cleanup), and the error shapes mirror the
 * non-stream JSON route; the
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

  // M1: per-user rate limit on job starts (see batch/start).
  const rl = rateLimit(`generate-image-prompt-start:${user.id}`, {
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
  const { images, style, controls: rawControls } = body as {
    images?: PromptImage[];
    style?: string;
    controls?: unknown;
  };

  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: 'images_required' }, { status: 400 });
  }
  // Same ceiling as the metadata batch route and the uploader: the
  // shared product policy (UNIVERSAL_BATCH_LIMIT = 100). A private 20
  // cap here hard-failed every Generate click with 21–100 images (T2-01).
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

  // H1/H2: the previewUrl fallback gets the same treatment as
  // batch/start — it must be the caller's own storage reference
  // (normalized to the canonical raw key) or a data: image within the
  // size cap. Before this, an omitted `key` let previewUrl point at
  // another user's object or an internal URL and the runner fetched it
  // verbatim (SSRF). External http(s) URLs are rejected here; the
  // extension's external-image flow uses the non-stream route, which
  // fetches through the guarded fetcher instead.
  const validatedImages: PromptImage[] = [];
  for (const img of images) {
    if (img.previewUrl) {
      const ref = normalizeOwnedImageRef(user.id, img.previewUrl);
      if (!ref.ok) {
        return NextResponse.json(
          { error: 'invalid_image_reference' },
          { status: 400 },
        );
      }
      validatedImages.push({ ...img, previewUrl: ref.value });
    } else {
      validatedImages.push(img);
    }
  }

  // Optional dashboard Prompt Controls (white background, camera
  // parameters, prompt length, prefix/suffix, negative words).
  const controls = parsePromptControls(rawControls);

  // R9 B9-06/S9-01: registry gate before any deduction — an admin
  // disabling 'image-to-prompt' (or restricting it to higher tiers)
  // stops job starts here too, not just the dashboard tile.
  try {
    await assertToolRunnable(TOOL_SLUG, user);
  } catch (e) {
    const gateRes = toolGateErrorResponse(e);
    if (gateRes) return gateRes;
    throw e;
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
        inputFileUrls: validatedImages.map((i) => i.key || i.fileName || ''),
        creditsCharged: deduction.deducted === true ? total : 0,
        outputData: {
          style: preset.slug,
          styleLabel: preset.label,
          images: validatedImages.map((i) => ({ id: i.id, fileName: i.fileName })),
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
    images: validatedImages,
    preset,
    costPerImage,
    deduction: {
      deducted: deduction.deducted === true,
      balance: deduction.balance,
    },
    controls,
  });

  return NextResponse.json({ jobId: job.id, total: images.length });
}
