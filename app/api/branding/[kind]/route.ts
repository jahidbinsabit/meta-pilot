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
 *
 * Variant selection (R7-03): if a previous variant's delete failed during
 * an upload, two files for the kind can exist (e.g. logo.png + logo.webp).
 * The listing order is NOT meaningful (S3 sorts lexicographically, which
 * would resurrect the OLD file), so this route always serves the variant
 * with the NEWEST lastModified; the key comparison is only a deterministic
 * tiebreak for identical timestamps.
 *
 * SVG hardening: uploaded SVGs are served with `Content-Security-Policy:
 * sandbox`, so even if a script-bearing SVG is navigated to directly it
 * cannot run script in the site's origin.
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
    const candidates = files.filter((f) => f.key.startsWith(`branding/${kind}.`));
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // Newest variant wins (R7-03) — see the header comment. lastModified
    // may be a Date (both storage modes) but normalise defensively.
    candidates.sort((a, b) => {
      const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    const match = candidates[0].key;

    const ext = (match.split('.').pop() || '').toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    };
    if (contentType === 'image/svg+xml') {
      // An SVG can carry script; sandbox it so a direct top-level
      // navigation can never execute it in this origin.
      headers['Content-Security-Policy'] = 'sandbox';
    }

    const data = await downloadFile(match);
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
