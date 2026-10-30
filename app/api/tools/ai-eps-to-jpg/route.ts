import { NextResponse } from 'next/server';
import { ownsStorageKey } from '@/lib/api/ownership';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/s3/client';
import { storePreview } from '@/lib/generator/images';
import { convertVectorToJpg } from '@/lib/tools/vector-convert';
import { assertToolRunnable, toolGateErrorResponse } from '@/lib/tools/gate';
import { rateLimit } from '@/lib/rate-limit';

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
    // R9 B9-06/S9-01: registry gate — free tools are gated too; a
    // disabled or tier-restricted tool must not run via this route.
    try {
      await assertToolRunnable('ai-eps-to-jpg', user);
    } catch (e) {
      const gateRes = toolGateErrorResponse(e);
      if (gateRes) return gateRes;
      throw e;
    }
    // R9 S9-04: per-user rate limit before CPU-heavy compute.
    const rl = rateLimit(`tools-ai-eps-to-jpg:${user.id}`, { max: 20, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }
    const body = await req.json();
    const { key, fileName, width = 2000 } = body;
    if (!key) {
      return new Response(JSON.stringify({ error: 'image_required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // M1: ownership check — the key comes straight from the client, so
    // prove it belongs to this user before downloading another user's file.
    if (!ownsStorageKey(user.id, key)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Free utility — no credit deduction.
    const original = await downloadFile(key);
    const { buffer, mime, width: outWidth, height: outHeight } = await convertVectorToJpg(original, width);
    const { key: outKey, url } = await storePreview(
      user.id,
      (fileName || 'converted.jpg').replace(/\.(ai|eps|svg)$/i, '.jpg'),
      buffer,
      mime,
    );

    await prisma.toolUsage.create({
      data: { userId: user.id, tool: 'ai-eps-to-jpg', metadata: { key, outKey } },
    });

    return NextResponse.json({ jpgUrl: url, width: outWidth, height: outHeight });
  } catch (e: any) {
    console.error('ai-eps-to-jpg failed', e);
    return new Response(JSON.stringify({ error: 'convert_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
