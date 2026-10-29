import sharp from 'sharp';
import { randomBytes } from 'crypto';
import { uploadImage, publicUrl } from '@/lib/s3/client';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export const ACCEPTED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/eps': '.eps',
  'application/x-eps': '.eps',
  'image/ai': '.ai',
  'application/postscript': '.ai',
  'application/illustrator': '.ai',
  'application/x-illustrator': '.ai',
};

export const ACCEPTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.svg', '.eps', '.ai']);

export async function convertSvgToPng(input: Buffer): Promise<Buffer> {
  try {
    // Sharp handles SVG directly with white background
    const png = await sharp(input, { density: 150 })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return png;
  } catch (e: any) {
    console.error('SVG conversion failed:', e);
    throw new Error('SVG conversion failed: ' + e.message);
  }
}

function extractPsOrTiffFromDosEps(buf: Buffer): { psBuffer: Buffer; tiffBuffer: Buffer | null } {
  if (buf.length > 32 && buf[0] === 0xc5 && buf[1] === 0xd0 && buf[2] === 0xd3 && buf[3] === 0xc6) {
    const psStart = buf.readUInt32LE(4);
    const psLength = buf.readUInt32LE(8);
    const tiffStart = buf.readUInt32LE(20);
    const tiffLength = buf.readUInt32LE(24);

    let tiffBuffer: Buffer | null = null;
    if (tiffStart > 0 && tiffLength > 0 && tiffStart + tiffLength <= buf.length) {
      tiffBuffer = buf.subarray(tiffStart, tiffStart + tiffLength);
    }

    let psBuffer = buf;
    if (psStart > 0 && psLength > 0 && psStart + psLength <= buf.length) {
      psBuffer = buf.subarray(psStart, psStart + psLength);
    }

    return { psBuffer, tiffBuffer };
  }
  return { psBuffer: buf, tiffBuffer: null };
}

/**
 * Page size of an EPS/AI file in PostScript points (72 pt = 1 inch), read
 * from the document's own headers: %%HiResBoundingBox / %%BoundingBox for
 * EPS, /MediaBox for PDF-based AI. Returns null when no usable header is
 * found (a "(atend)" BoundingBox counts as not found).
 */
export function parseVectorPageSizePoints(input: Buffer): { widthPts: number; heightPts: number } | null {
  const head = input.toString('latin1', 0, Math.min(input.length, 65536));
  const box = (x1: number, y1: number, x2: number, y2: number) => {
    const widthPts = Math.abs(x2 - x1);
    const heightPts = Math.abs(y2 - y1);
    return widthPts > 0 && heightPts > 0 ? { widthPts, heightPts } : null;
  };
  const hires = head.match(/%%HiResBoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
  if (hires) return box(+hires[1], +hires[2], +hires[3], +hires[4]);
  const bbox = head.match(/%%BoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
  if (bbox) return box(+bbox[1], +bbox[2], +bbox[3], +bbox[4]);
  const media = head.match(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/);
  if (media) return box(+media[1], +media[2], +media[3], +media[4]);
  return null;
}

/**
 * Render DPI that makes the page's long side land near targetLongSide px.
 * The generation pipeline only ever consumes <=1024px images, so rendering
 * a large artboard at a flat 150 DPI (easily 5000-10000px) wastes most of
 * the Ghostscript time. Clamped to [10, 150] — never upscale past the old
 * behaviour, never go so low the render turns to mush.
 */
export function rasterDpiFor(
  pagePts: { widthPts: number; heightPts: number } | null,
  targetLongSide: number,
): number {
  if (!pagePts) return 150;
  const longPts = Math.max(pagePts.widthPts, pagePts.heightPts);
  if (!(longPts > 0)) return 150;
  return Math.min(150, Math.max(10, Math.round(targetLongSide / (longPts / 72))));
}

/** Safety net: shrink an oversized raster down to targetLongSide px. */
async function capPngSize(png: Buffer, targetLongSide: number): Promise<Buffer> {
  try {
    const meta = await sharp(png).metadata();
    const long = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (long > targetLongSide) {
      return await sharp(png)
        .resize(targetLongSide, targetLongSide, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    }
  } catch {
    // sizing is best-effort; the original buffer is still valid
  }
  return png;
}

export async function convertEpsAiToPng(input: Buffer, targetLongSide = 1280): Promise<Buffer> {
  const { psBuffer, tiffBuffer } = extractPsOrTiffFromDosEps(input);
  const dpi = rasterDpiFor(parseVectorPageSizePoints(psBuffer), targetLongSide);

  // If there's an embedded TIFF thumbnail, try rendering it first with Sharp
  if (tiffBuffer && tiffBuffer.length > 0) {
    try {
      const png = await sharp(tiffBuffer).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
      if (png && png.length > 0) return capPngSize(png, targetLongSide);
    } catch {
      // TIFF extraction failed, continue to GS
    }
  }

  const tmpDir = os.tmpdir();
  const id = randomBytes(8).toString('hex');
  const inPath = path.join(tmpDir, `vec-${id}.eps`);
  const outPath = path.join(tmpDir, `vec-${id}.png`);

  try {
    await fs.writeFile(inPath, psBuffer);

    // 1. Try Ghostscript with -dEPSCrop
    try {
      await execFileAsync('gs', [
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-dEPSCrop',
        `-r${dpi}`,
        '-sDEVICE=png16m',
        `-sOutputFile=${outPath}`,
        inPath,
      ]);
      const res = await fs.readFile(outPath);
      if (res && res.length > 0) return capPngSize(res, targetLongSide);
    } catch {
      // 2. Try Ghostscript without -dEPSCrop (e.g. AI / PDF)
      try {
        await execFileAsync('gs', [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          `-r${dpi}`,
          '-sDEVICE=png16m',
          `-sOutputFile=${outPath}`,
          inPath,
        ]);
        const res = await fs.readFile(outPath);
        if (res && res.length > 0) return capPngSize(res, targetLongSide);
      } catch {
        // 3. Try ImageMagick / convert
        try {
          await execFileAsync('convert', [
            '-density',
            String(dpi),
            inPath,
            '-background',
            'white',
            '-flatten',
            outPath,
          ]);
          const res = await fs.readFile(outPath);
          if (res && res.length > 0) return capPngSize(res, targetLongSide);
        } catch (convErr) {
          console.warn('ImageMagick convert failed:', convErr);
        }
      }
    }
  } catch (err) {
    console.warn('Vector rasterization failed:', err);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }

  // Fallback to placeholder if GS/convert fails
  return extractOrCreatePreviewFromPostScript(input);
}

export async function extractOrCreatePreviewFromPostScript(input: Buffer): Promise<Buffer> {
  const placeholder = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 240, g: 240, b: 240 } },
  }).png().toBuffer();
  return placeholder;
}

export async function resizeImage(
  input: Buffer,
  mime: string,
  maxDim = 1024,
  quality = 80,
): Promise<{ buffer: Buffer; width: number; height: number; mime: string }> {
  try {
    if (!input || input.length === 0) {
      throw new Error('Empty input buffer');
    }

    let rawBuffer = input;
    const isSvg = mime.includes('svg') || input.toString('utf-8', 0, 64).toLowerCase().includes('<svg');
    const isEpsAi = mime.includes('eps') || mime.includes('postscript') || mime.includes('illustrator') || input.toString('utf-8', 0, 16).startsWith('%!PS');

    if (isSvg) {
      rawBuffer = await convertSvgToPng(input);
    } else if (isEpsAi) {
      rawBuffer = await convertEpsAiToPng(input);
    }

    let image = sharp(rawBuffer);
    const metadata = await image.metadata();
    
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    // Resize and flatten on white background for AI vision models
    image = sharp(rawBuffer)
      .rotate() // Auto-orient based on EXIF
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } });
    
    // Convert to JPEG for consistency
    const resized = await image
      .jpeg({ quality, progressive: true })
      .toBuffer();
      
    return { buffer: resized, width, height, mime: 'image/jpeg' };
  } catch (e: any) {
    console.error('Image resize failed:', e);
    // Return original buffer as fallback
    return { buffer: input, width: 0, height: 0, mime: mime || 'image/png' };
  }
}

export async function storePreview(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mime: string,
): Promise<{ key: string; url: string }> {
  const key = 'previews/' + userId + '/' + Date.now() + '-' + randomBytes(4).toString('hex') + '-' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  await uploadImage(key, buffer, mime);
  return { key, url: publicUrl(key) };
}

