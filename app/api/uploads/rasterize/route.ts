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
    const pngName = file.name.replace(/\.[^.]+$/, '') + '.png';
    const { key, url } = await storePreview(user.id, pngName, pngBuffer, 'image/png');
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    return NextResponse.json({
      key,
      mime: 'image/png',
      previewUrl: url,
      dataUrl,
      uploadUrl: null,
    });
  } catch (e: any) {
    console.error(`rasterize failed at step [${step}]:`, e?.message, e?.stack);
    return NextResponse.json(
      { error: e?.message || 'rasterize_failed', step },
      { status: 500 },
    );
  }
}

