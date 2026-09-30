import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getToolCost } from '@/lib/credits/cost';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/s3/client';
import { storePreview } from '@/lib/generator/images';
import { convertVectorToJpg } from '@/lib/tools/vector-convert';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * AI/EPS to JPG (PROMPT 10.7).
 *
 * Free/utility tool — no credit cost. Converts a vector file (AI, EPS,
 * SVG) stored in S3 into a raster JPG via Ghostscript / ImageMagick.
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const { key, fileName, width = 2000 } = body;
    if (!key) {
      return new Response(JSON.stringify({ error: 'image_required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Free utility — no credit deduction.
    const original = await downloadFile(key);
    const { buffer, mime } = await convertVectorToJpg(original, width);
    const { key: outKey, url } = await storePreview(
      user.id,
      (fileName || 'converted.jpg').replace(/\.(ai|eps|svg)$/i, '.jpg'),
      buffer,
      mime,
    );

    await prisma.toolUsage.create({
      data: { userId: user.id, tool: 'ai-eps-to-jpg', metadata: { key, outKey } },
    });

    return NextResponse.json({ jpgUrl: url, width: 0, height: 0 });
  } catch (e: any) {
    console.error('ai-eps-to-jpg failed', e);
    return new Response(JSON.stringify({ error: e?.message || 'convert_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
