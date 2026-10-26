import { NextResponse } from 'next/server';
import { downloadFile, listFiles } from '@/lib/s3/client';

/**
 * Public branding file server — GET /api/branding/<kind> (logo | favicon).
 *
 * Serves the single stored branding file for the kind from app storage
 * (works in both S3 and local-storage modes via downloadFile), so
 * SiteSettings can point at this internal URL instead of an external link.
 * No auth: this is the public site logo / favicon.
 *
 * Responses are cached immutably for a day — uploads store the setting as
 * /api/branding/<kind>?v=<timestamp>, so a replacement gets a fresh URL.
 */

export const runtime = 'nodejs';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

export async function GET(
  _req: Request,
  { params }: { params: { kind: string } },
) {
  const kind = params.kind;
  if (kind !== 'logo' && kind !== 'favicon') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    const files = await listFiles('branding/');
    const match = files
      .map((f) => f.key)
      .find((k) => k.startsWith(`branding/${kind}.`));
    if (!match) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const ext = (match.split('.').pop() || '').toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';

    const data = await downloadFile(match);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
