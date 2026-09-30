import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { requireApiUser } from '@/lib/api/auth';
import {
  ACCEPTED_EXTENSIONS,
  rasterizeVectorToPng,
  resizeImage,
  storePreview,
} from '@/lib/generator/images';

/**
 * Server-side rasterization for vector formats. Browsers cannot render EPS,
 * AI, or reliably SVG, and none of them are valid AI-vision input, so the file
 * is converted to a PNG preview here via Ghostscript (EPS/AI) and stored in
 * S3. The client posts the raw file bytes here and receives back the same
 * shape as /api/uploads/preview, so the uploader treats both paths alike.
 *
 * POST /api/uploads/rasterize (multipart/form-data: file)
 *   -> { uploadUrl, key, mime, previewUrl, width, height }
 */

export const runtime = 'nodejs';
// Vector files are small, but Ghostscript plus the buffer copy needs headroom.
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(['.eps', '.ai', '.svg']);

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
    if (!ACCEPTED_EXTENSIONS.has(ext) || !ALLOWED.has(ext)) {
      return NextResponse.json(
        { error: 'unsupported_format', message: 'Only EPS, AI, and SVG can be rasterized.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());

    // Ghostscript handles EPS/AI. SVG is already a rasterizable XML format;
    // ImageMagick converts it (rasterizeVectorToPng would fail on it).
    const raster: Buffer =
      ext === '.svg'
        ? await convertViaImageMagick(input)
        : await rasterizeVectorToPng(input, ext as '.eps' | '.ai');

    const { buffer, mime } = await resizeImage(raster, 'image/png', 1600);
    const { key, url } = await storePreview(user.id, file.name, buffer, mime);

    return NextResponse.json({
      key,
      mime,
      previewUrl: url,
      uploadUrl: null,
    });
  } catch (e: any) {
    console.error('rasterize failed', e);
    return NextResponse.json({ error: e?.message || 'rasterize_failed' }, { status: 500 });
  }
}

/** Rasterize SVG to PNG via ImageMagick. */
function convertViaImageMagick(input: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const tmpIn = `/tmp/svg-in-${randomBytes(6).toString('hex')}.svg`;
    const tmpOut = `/tmp/svg-out-${randomBytes(6).toString('hex')}.png`;
    writeFileSync(tmpIn, input);
    const child = spawn('convert', ['-background', 'none', tmpIn, tmpOut], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        if (code !== 0)
          throw new Error(`SVG conversion failed (code ${code}): ${err.slice(0, 200)}`);
        const out = readFileSync(tmpOut);
        unlinkSync(tmpIn);
        unlinkSync(tmpOut);
        resolve(out);
      } catch (e) {
        reject(e);
      }
    });
  });
}
