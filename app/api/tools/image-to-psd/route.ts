import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { deductCredits, refundCredits } from '@/lib/credits/engine';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/s3/client';
import { storePreview } from '@/lib/generator/images';
import { buildLayeredPsd } from '@/lib/tools/psd-builder';

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
    const body = await req.json();
    const { key, fileName } = body;
    if (!key) {
      return new Response(JSON.stringify({ error: 'image_required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cost = await getToolCost('image-to-psd');
    const deduction = await deductCredits(user.id, cost, 'SPEND', { 
      key,
      toolSlug: 'image-to-psd',
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
      out = await buildLayeredPsd(original);
    } catch (e: any) {
      await refundCredits(user.id, 'image-to-psd', cost);
      throw e;
    }

    const { key: outKey, url } = await storePreview(
      user.id,
      (fileName || 'layered.psd').replace(/\.(png|jpg|jpeg)$/i, '.psd'),
      out,
      'image/vnd.adobe.photoshop',
    );

    await prisma.toolUsage.create({
      data: {
        userId: user.id,
        tool: 'image-to-psd',
        metadata: { key, outKey, layers: ['background', 'subject'] },
      },
    });

    return NextResponse.json({
      psdUrl: url,
      layers: ['background', 'subject'],
      balance: deduction.balance,
    });
  } catch (e: any) {
    console.error('image-to-psd failed', e);
    return new Response(JSON.stringify({ error: e?.message || 'psd_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
