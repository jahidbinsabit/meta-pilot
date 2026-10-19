import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { ownsStorageKey } from '@/lib/api/ownership';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  eps: 'image/eps',
  ai: 'application/illustrator',
};

/**
 * Extensions safe to render inline in an <img> tag. Everything else —
 * notably svg (removed from the map entirely: it can carry <script> and
 * would execute in our origin) — is forced to download as an opaque blob
 * so browsers never render it as active content.
 */
const INLINE_SAFE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

export async function GET(
  req: Request,
  { params }: { params: { file: string[] } }
) {
  try {
    // B4: this route used to serve every file in public/uploads/ with no
    // authentication. Require a session, like /api/s3/[...key] does.
    const user = await requireApiUser(req);

    const rawSegments = params.file || [];
    // L3: malformed %-escapes throw URIError — return 400, not 500.
    let filename: string;
    try {
      filename = rawSegments.map(decodeURIComponent).join('/');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const cleanName = path.basename(filename);

    // Safety check: prohibit path traversal
    if (filename.includes('..') || cleanName !== filename) {
      return new Response('Forbidden', { status: 403 });
    }

    // Ownership check: local files are flattened from user-scoped keys —
    // Ownership check via the shared helper (same as the s3 route and
    // the tool routes). The trailing dash prevents prefix collisions
    // between user ids (e.g. `abc` vs `abc1`).
    if (!ownsStorageKey(user.id, cleanName)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const filePath = path.join(process.cwd(), 'public', 'uploads', cleanName);
    const buffer = await fs.readFile(filePath);

    const ext = cleanName.split('.').pop()?.toLowerCase() || '';
    const inlineSafe = INLINE_SAFE.has(ext);
    // B5: non-image files (svg/eps/ai/unknown) are served as opaque
    // attachments — never with an executable content type.
    const contentType = inlineSafe ? MIME_MAP[ext] : 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      // Authenticated per-user content: private cache, like the s3 route.
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    };
    if (!inlineSafe) {
      // L2: sanitize filename — strip quotes/CR/LF to block header injection.
      const safeName = cleanName.replace(/["\r\n]/g, '');
      headers['Content-Disposition'] = `attachment; filename="${safeName}"`;
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers,
    });
  } catch (err: any) {
    if (err?.message === 'UNAUTHORIZED') {
      return new Response('unauthorized', { status: 401 });
    }
    if (err?.code === 'ENOENT') {
      return new Response('File not found', { status: 404 });
    }
    return new Response('Internal error', { status: 500 });
  }
}
