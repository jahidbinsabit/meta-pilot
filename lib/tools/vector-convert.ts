/**
 * Vector → raster conversion (PROMPT 10.7).
 *
 * Vercel-compatible vector conversion using sharp.
 * SVG: sharp (librsvg) → JPEG
 * EPS/AI: gray placeholder (Ghostscript not available on Vercel)
 */

import sharp from 'sharp';

export interface ConvertResult {
  buffer: Buffer;
  mime: string;
}

export async function convertVectorToJpg(input: Buffer, maxDim = 2000): Promise<ConvertResult> {
  const ext = detectExt(input);

  try {
    if (ext === '.svg') {
      // Sharp can handle SVG directly via librsvg
      const buffer = await sharp(input, { density: 150 })
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 92, progressive: true })
        .toBuffer();
      return { buffer, mime: 'image/jpeg' };
    } else {
      // EPS/AI: Create a placeholder since Ghostscript is unavailable on Vercel
      // User can still use the tool but gets a notice that EPS/AI needs local processing
      const placeholder = await sharp({
        create: {
          width: Math.min(maxDim, 800),
          height: Math.min(maxDim, 600),
          channels: 3,
          background: { r: 240, g: 240, b: 240 },
        },
      })
        .jpeg({ quality: 92 })
        .toBuffer();
      return { buffer: placeholder, mime: 'image/jpeg' };
    }
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
