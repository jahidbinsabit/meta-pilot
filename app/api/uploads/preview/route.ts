import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { makeKey, publicUrl } from '@/lib/s3/client';

/**
 * Issues upload metadata so the client can call /api/uploads/direct.
 *
 * Previously returned a presigned S3 PUT URL, but Cloudflare R2 (and most
 * S3-compatible stores) require a bucket-level CORS policy for browser-direct
 * PUTs. Rather than require that config, we always proxy through the server
 * via /api/uploads/direct — this keeps things simple and works on any host.
 *
 * POST /api/uploads/preview  { name, size, type }
 *   -> { useDirectUpload: true, key, mime, previewUrl }
 */

const MAX_BYTES = 25 * 1024 * 1024;

/** Extensions that can be uploaded as-is; everything else must be rasterized. */
const DIRECT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function extOf(name: string): string {
  return '.' + (name.split('.').pop() || '').toLowerCase();
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const name = String(body?.name || '');
    const size = Number(body?.size || 0);
    const type = String(body?.type || '');

    if (!name) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 });
    }
    if (size > MAX_BYTES) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
    }

    const ext = extOf(name);
    if (!DIRECT_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          error: 'requires_rasterization',
          message: `${ext.toUpperCase()} files must be converted server-side; use /api/uploads/rasterize.`,
        },
        { status: 400 },
      );
    }

    // Always tell the client to use server-proxied upload.
    // This avoids needing CORS configured on the S3/R2 bucket.
    const key = makeKey(user.id, name);
    const mime = MIME_BY_EXT[ext] || type || 'image/jpeg';
    const previewUrl = publicUrl(key);

    return NextResponse.json({
      useDirectUpload: true,
      key,
      mime,
      previewUrl,
    });
  } catch (e: any) {
    console.error('upload preview failed', e);
    return NextResponse.json({ error: e?.message || 'preview_failed' }, { status: 500 });
  }
}

