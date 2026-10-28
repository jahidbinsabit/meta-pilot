/**
 * Vector → raster conversion (PROMPT 10.7).
 *
 * SVG: sharp (librsvg) → JPEG
 * EPS/AI: real Ghostscript rasterization via `convertEpsAiToPng` from
 * the generator image pipeline (the same rasterizer the upload flow
 * uses), then PNG → JPEG via sharp. (Audit R6 / N5 — previously EPS/AI
 * returned a blank gray placeholder box.)
 */

import sharp from 'sharp';
import { convertEpsAiToPng } from '@/lib/generator/images';

export interface ConvertResult {
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
}

export async function convertVectorToJpg(input: Buffer, maxDim = 2000): Promise<ConvertResult> {
  const ext = detectExt(input);

  try {
    let buffer: Buffer;
    if (ext === '.svg') {
      // Sharp can handle SVG directly via librsvg
      buffer = await sharp(input, { density: 150 })
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 92, progressive: true })
        .toBuffer();
    } else {
      // EPS/AI: rasterize with Ghostscript (real conversion, no placeholder).
      // Render near the tool's own 2000px output cap instead of an
      // unbounded 150-DPI render that gets downscaled right after anyway.
      const png = await convertEpsAiToPng(input, 2048);
      buffer = await sharp(png)
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 92, progressive: true })
        .toBuffer();
    }
    const meta = await sharp(buffer).metadata();
    return { buffer, mime: 'image/jpeg', width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch (e: any) {
    throw new Error(`Vector conversion failed: ${e.message}`);
  }
}

function detectExt(input: Buffer): '.ai' | '.eps' | '.svg' {
  const head = input.toString('utf-8', 0, 64).trim();
  if (head.startsWith('%!PS') || head.startsWith('%!')) return '.eps';
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.toLowerCase().includes('<svg'))
    return '.svg';
  return '.ai';
}
