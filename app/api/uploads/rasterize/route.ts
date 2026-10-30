import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import {
  ACCEPTED_EXTENSIONS,
  convertSvgToPng,
  convertEpsAiToPng,
  storePreview,
} from '@/lib/generator/images';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(['.eps', '.ai', '.svg']);

function extOf(name: string): string {
  return '.' + (name.split('.').pop() || '').toLowerCase();
}

export async function POST(req: Request) {
  let step = 'init';
  try {
    step = 'auth';
    const user = await requireApiUser(req);

    step = 'formdata';
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

    step = 'read_buffer';
    const input = Buffer.from(await file.arrayBuffer());

    step = 'rasterize';
    let pngBuffer: Buffer;

    if (ext === '.svg') {
      pngBuffer = await convertSvgToPng(input);
    } else {
      // EPS / AI: Real rasterization using Ghostscript / ImageMagick
      pngBuffer = await convertEpsAiToPng(input);
    }

    step = 'store';
    // Deliver the raster exactly like a compressed photo upload: <=1024px
    // long side, JPEG. The generation pipeline only ever consumes images
    // at that size, and a multi-MB PNG would otherwise be stored AND
    // shipped back inline as a base64 dataUrl — most of the "ready" wait
    // for big vector files. Falls back to the raw PNG if encoding fails.
    let outBuffer = pngBuffer;
    let outMime = 'image/png';
    let outExt = '.png';
    try {
      outBuffer = await sharp(pngBuffer)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 82 })
        .toBuffer();
      outMime = 'image/jpeg';
      outExt = '.jpg';
    } catch {
      // keep the PNG as-is
    }
    const outName = file.name.replace(/\.[^.]+$/, '') + outExt;
    const { key, url } = await storePreview(user.id, outName, outBuffer, outMime);
    const dataUrl = `data:${outMime};base64,${outBuffer.toString('base64')}`;

    return NextResponse.json({
      key,
      mime: outMime,
      previewUrl: url,
      dataUrl,
      uploadUrl: null,
    });
  } catch (e: any) {
    console.error(`rasterize failed at step [${step}]:`, e?.message, e?.stack);
    return NextResponse.json(
      { error: 'rasterize_failed', step },
      { status: 500 },
    );
  }
}

