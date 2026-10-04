import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import {
  ACCEPTED_EXTENSIONS,
  convertSvgToPng,
  storePreview,
} from '@/lib/generator/images';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(['.eps', '.ai', '.svg']);

function extOf(name: string): string {
  return '.' + (name.split('.').pop() || '').toLowerCase();
}

/** Gray 800×600 placeholder PNG for EPS/AI files (no Ghostscript on Vercel) */
async function makePlaceholderPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 220, g: 220, b: 220 },
    },
  })
    .png()
    .toBuffer();
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
      // EPS/AI: Ghostscript unavailable on Vercel — use gray placeholder
      pngBuffer = await makePlaceholderPng();
    }

    step = 'store';
    const pngName = file.name.replace(/\.[^.]+$/, '') + '.png';
    const { key, url } = await storePreview(user.id, pngName, pngBuffer, 'image/png');

    return NextResponse.json({
      key,
      mime: 'image/png',
      previewUrl: url,
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

