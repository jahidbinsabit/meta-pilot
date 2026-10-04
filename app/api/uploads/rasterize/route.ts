import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import {
  ACCEPTED_EXTENSIONS,
  convertSvgToPng,
  extractOrCreatePreviewFromPostScript,
  resizeImage,
  storePreview,
} from '@/lib/generator/images';

export const runtime = 'nodejs';
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

    let raster: Buffer;
    if (ext === '.svg') {
      raster = await convertSvgToPng(input);
    } else {
      raster = await extractOrCreatePreviewFromPostScript(input);
    }

    const { buffer, mime } = await resizeImage(raster, 'image/png', 1600);
    const pngName = file.name.replace(/\.[^.]+$/, '') + '.png';
    const { key, url } = await storePreview(user.id, pngName, buffer, mime);

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
