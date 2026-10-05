import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { uploadImage, makeKey, publicUrl, deleteFile } from '@/lib/s3/client';

/**
 * Fallback upload route that proxies files through the Next.js server
 * instead of using presigned S3 URLs. Used when S3_ENDPOINT is unreachable
 * (e.g., MinIO not running locally).
 *
 * POST /api/uploads/direct (multipart/form-data: file)
 *   -> { key, mime, previewUrl }
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.svg', '.eps', '.ai']);

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.eps': 'image/x-eps',
  '.ai': 'application/illustrator',
};

function extOf(name: string): string {
  return '.' + (name.split('.').pop() || '').toLowerCase();
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_required' }, { status: 400 });
    }

    const ext = extOf(file.name);
    if (!ALLOWED.has(ext)) {
      return NextResponse.json(
        {
          error: 'unsupported_format',
          message: 'Only JPG and PNG can be uploaded directly.',
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = makeKey(user.id, file.name);
    const mime = MIME_BY_EXT[ext] || file.type || 'image/png';

    // Upload directly to S3 via server
    try {
      await uploadImage(key, buffer, mime);
      const previewUrl = publicUrl(key);

      return NextResponse.json({
        key,
        mime,
        previewUrl,
        uploadUrl: null, // Not using presigned URL
      });
    } catch (uploadError: any) {
      // If upload fails, ensure no partial files are left
      console.error('Upload failed, attempting cleanup:', uploadError);
      try {
        await deleteFile(key);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
      throw uploadError;
    }
  } catch (e: any) {
    console.error('direct upload failed', e);
    return NextResponse.json({ error: e?.message || 'upload_failed' }, { status: 500 });
  }
}
