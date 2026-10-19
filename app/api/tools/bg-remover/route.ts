import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { deductCredits, refundCredits } from '@/lib/credits/engine';
import { isInsufficientCreditsError } from '@/lib/credits/errors';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/s3/client';
import { storePreview } from '@/lib/generator/images';
import { removeBackground } from '@/lib/tools/bg-remover';

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
    // credits on) another user's file. Same prefix pattern as
    // app/uploads/[...file]/route.ts; the trailing dash prevents prefix
    // collisions between user ids.
    const owned =
      key.startsWith(`uploads-${user.id}-`) ||
      key.startsWith(`previews-${user.id}-`);
    if (!owned) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const cost = await getToolCost('bg-remover');
    let deduction;
    try {
      deduction = await deductCredits(user.id, cost, 'SPEND', { 
        key,
        toolSlug: 'bg-remover',
      });
    } catch (e) {
      if (isInsufficientCreditsError(e)) {
        return new Response(
          JSON.stringify({ error: 'insufficient_credits', balance: e.balance, needed: e.needed }),
          { status: 402, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw e;
    }
    if (!deduction.ok) {
      return new Response(
        JSON.stringify({ error: 'insufficient_credits', balance: deduction.balance }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let out: Buffer;
    try {
      const original = await downloadFile(key);
      out = await removeBackground(original);
    } catch (e: any) {
      // Only refund when credits were actually deducted (not unlimited mode).
      // Refund failure must not mask the original error.
      if (deduction.deducted === true) {
        try {
          await refundCredits(user.id, 'bg-remover', cost);
        } catch (refundErr) {
          console.error('bg-remover refund failed', refundErr);
        }
      }
      throw e;
    }

    const { key: outKey, url } = await storePreview(
      user.id,
      fileName || 'bg-removed.png',
      out,
      'image/png',
    );

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

    await prisma.toolUsage.create({
      data: { userId: user.id, tool: 'bg-remover', metadata: { key, outKey } },
    });

    return NextResponse.json({ pngUrl: url, width, height, balance: deduction.balance });
  } catch (e: any) {
    console.error('bg-remover failed', e);
    return new Response(JSON.stringify({ error: 'bg_removal_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
