import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { deductCredits, refundCredits } from '@/lib/credits/engine';
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

    const cost = await getToolCost('bg-remover');
    const deduction = await deductCredits(user.id, cost, 'SPEND', { 
      key,
      toolSlug: 'bg-remover',
    });
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
      await refundCredits(user.id, 'bg-remover', cost);
      throw e;
    }

    const { key: outKey, url } = await storePreview(
      user.id,
      fileName || 'bg-removed.png',
      out,
      'image/png',
    );

    await prisma.toolUsage.create({
      data: { userId: user.id, tool: 'bg-remover', metadata: { key, outKey } },
    });

    return NextResponse.json({ pngUrl: url, width: 0, height: 0, balance: deduction.balance });
  } catch (e: any) {
    console.error('bg-remover failed', e);
    return new Response(JSON.stringify({ error: e?.message || 'bg_removal_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
