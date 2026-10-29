import { NextResponse } from 'next/server';
import { ownsStorageKey } from '@/lib/api/ownership';
import sharp from 'sharp';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/s3/client';
import { storePreview } from '@/lib/generator/images';
import { removeBackground } from '@/lib/tools/bg-remover';
import { assertToolRunnable, toolGateErrorResponse } from '@/lib/tools/gate';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Background removal (PROMPT 10.1).
 *
 * Server-side deterministic algorithm: sample the four corner colours and
 * make matching (fuzzy) pixels transparent, producing a PNG with alpha.
 * The credit is refunded if the step fails.
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    // R9 B9-06/S9-01: registry gate before any charge — a disabled or
    // tier-restricted tool must not run via its dedicated route either.
    try {
      await assertToolRunnable('bg-remover', user);
    } catch (e) {
      const gateRes = toolGateErrorResponse(e);
      if (gateRes) return gateRes;
      throw e;
    }
    // R9 S9-04: per-user rate limit before CPU-heavy compute.
    const rl = rateLimit(`tools-bg-remover:${user.id}`, { max: 60, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }
    // R7-02: NO BYOK gate here — background removal is a fully local,
    // deterministic corner-colour chroma key (lib/tools/bg-remover); it
    // never calls an AI provider, so keyless users must not be blocked
    // while BYOK mode is on.
    const body = await req.json();
    const { key, fileName } = body;
    if (!key) {
      return new Response(JSON.stringify({ error: 'image_required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // M1: ownership check — the key comes straight from the client, so
    // prove it belongs to this user before downloading (and spending
    // Ownership check — same helper as app/uploads/[...file]/route.ts.
    if (!ownsStorageKey(user.id, key)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const cost = await getToolCost('bg-remover');
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: 'invalid_tool_cost' }, { status: 500 });
    }
    const charged = await chargeCredits(user.id, cost, 'SPEND', {
      key,
      toolSlug: 'bg-remover',
    });
    if (charged instanceof NextResponse) return charged;
    const deduction = charged;

    let out: Buffer;
    let outKey: string;
    let url: string;
    try {
      const original = await downloadFile(key);
      out = await removeBackground(original);
      // H-A2: storePreview + toolUsage.create are inside the refund guard —
      // a failure here must refund, not 500 with lost credits.
      const stored = await storePreview(
        user.id,
        fileName || 'bg-removed.png',
        out,
        'image/png',
      );
      outKey = stored.key;
      url = stored.url;
      await prisma.toolUsage.create({
        data: { userId: user.id, tool: 'bg-remover', metadata: { key, outKey } },
      });
    } catch (e: any) {
      // Only refund when credits were actually deducted (not unlimited mode).
      // Refund failure must not mask the original error.
      if (deduction.deducted === true) {
        try {
          await refundCredits(user.id, '', cost, { toolSlug: 'bg-remover' });
        } catch (refundErr) {
          console.error('bg-remover refund failed', refundErr);
        }
      }
      throw e;
    }

    // Real output dimensions via sharp metadata (never hardcode 0).
    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(out).metadata();
      width = meta.width || 0;
      height = meta.height || 0;
    } catch {
      /* metadata failure is non-fatal */
    }

    return NextResponse.json({ pngUrl: url, width, height, balance: deduction.balance });
  } catch (e: any) {
    console.error('bg-remover failed', e);
    return new Response(JSON.stringify({ error: 'bg_removal_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
