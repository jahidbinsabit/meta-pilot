import { NextResponse } from 'next/server';
import { ownsStorageKey } from '@/lib/api/ownership';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { refundCredits } from '@/lib/credits/engine';
import { chargeCredits } from '@/lib/credits/charge';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/s3/client';
import { storePreview } from '@/lib/generator/images';
import { buildLayeredPsd } from '@/lib/tools/psd-builder';
import { assertToolRunnable, toolGateErrorResponse } from '@/lib/tools/gate';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Image to PSD (PROMPT 10.10).
 *
 * Produces a layered PSD: a background layer with the full image, plus a
 * subject layer where the subject has been separated from the background
 * (border-colour chroma key, same deterministic algorithm as bg-remover).
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    // R9 B9-06/S9-01: registry gate before any charge — a disabled or
    // tier-restricted tool must not run via its dedicated route either.
    try {
      await assertToolRunnable('image-to-psd', user);
    } catch (e) {
      const gateRes = toolGateErrorResponse(e);
      if (gateRes) return gateRes;
      throw e;
    }
    // R9 S9-04: per-user rate limit before CPU-heavy compute.
    const rl = rateLimit(`tools-image-to-psd:${user.id}`, { max: 20, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }
    // R7-02: NO BYOK gate here — this tool is fully local (sharp decode +
    // deterministic chroma-key in buildLayeredPsd); it never calls an AI
    // provider, so keyless users must not be blocked while BYOK mode is on.
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

    const cost = await getToolCost('image-to-psd');
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: 'invalid_tool_cost' }, { status: 500 });
    }
    const charged = await chargeCredits(user.id, cost, 'SPEND', {
      key,
      toolSlug: 'image-to-psd',
    });
    if (charged instanceof NextResponse) return charged;
    const deduction = charged;

    let out: Buffer;
    let outKey: string;
    let url: string;
    try {
      const original = await downloadFile(key);
      out = await buildLayeredPsd(original);
      // H-A2: storePreview + toolUsage.create are inside the refund guard —
      // a failure here must refund, not 500 with lost credits.
      const stored = await storePreview(
        user.id,
        (fileName || 'layered.psd').replace(/\.(png|jpg|jpeg)$/i, '.psd'),
        out,
        'image/vnd.adobe.photoshop',
      );
      outKey = stored.key;
      url = stored.url;
      await prisma.toolUsage.create({
        data: {
          userId: user.id,
          tool: 'image-to-psd',
          metadata: { key, outKey, layers: ['background', 'subject'] },
        },
      });
    } catch (e: any) {
      // Only refund when credits were actually deducted (not unlimited mode).
      // Refund failure must not mask the original error.
      if (deduction.deducted === true) {
        try {
          await refundCredits(user.id, '', cost, { toolSlug: 'image-to-psd' });
        } catch (refundErr) {
          console.error('image-to-psd refund failed', refundErr);
        }
      }
      throw e;
    }

    return NextResponse.json({
      psdUrl: url,
      layers: ['background', 'subject'],
      balance: deduction.balance,
    });
  } catch (e: any) {
    console.error('image-to-psd failed', e);
    return new Response(JSON.stringify({ error: 'psd_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
