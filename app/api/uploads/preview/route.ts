import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { makeKey, presignedPutUrl, publicUrl } from '@/lib/s3/client';

/**
 * Issues a presigned upload URL for a directly-uploadable image so the browser
 * can PUT the bytes straight to S3 without proxying them through this app.
 *
 * Only formats a browser can hand us as-is are served here. EPS/AI/SVG cannot
 * be rendered by a browser and are not valid AI-vision input, so they go to
 * /api/uploads/rasterize instead, which converts them server-side.
 *
 * For local storage mode, this returns a flag indicating the client should
 * fall back to /api/uploads/direct instead.
 *
 * POST /api/uploads/preview  { name, size, type }
 *   -> { uploadUrl, key, mime, previewUrl } OR { useDirectUpload: true }
 */

const MAX_BYTES = 25 * 1024 * 1024;
const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === 'true';

/** Extensions that can be uploaded as-is; everything else must be rasterized. */
const DIRECT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
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

    // For local storage, tell the client to use direct upload instead
    if (USE_LOCAL_STORAGE) {
      return NextResponse.json({ 
        useDirectUpload: true,
        message: 'Presigned uploads not supported with local storage, use /api/uploads/direct'
      });
    }

    const key = makeKey(user.id, name);
    const mime = MIME_BY_EXT[ext] || type || 'image/png';
    const uploadUrl = await presignedPutUrl(key, mime);
    const previewUrl = publicUrl(key);

    return NextResponse.json({ uploadUrl, key, mime, previewUrl });
  } catch (e: any) {
    console.error('upload preview failed', e);
    return NextResponse.json({ error: e?.message || 'preview_failed' }, { status: 500 });
  }
}
