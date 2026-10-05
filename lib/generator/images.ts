import sharp from 'sharp';
import { randomBytes } from 'crypto';
import { uploadImage, publicUrl } from '@/lib/s3/client';
import { prisma } from '@/lib/db';
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

export function isAccepted(file: File): boolean {
  const ext = ('.' + file.name.split('.').pop() || '').toLowerCase();
  if (ACCEPTED_EXTENSIONS.has(ext)) return true;
  return !!ACCEPTED_MIME[file.type];
}

export function isVector(file: File): boolean {
  const ext = ('.' + file.name.split('.').pop() || '').toLowerCase();
  return ext === '.svg' || ext === '.eps' || ext === '.ai';
}

export function isRasterizableVector(file: File): boolean {
  const ext = ('.' + file.name.split('.').pop() || '').toLowerCase();
  return ext === '.eps' || ext === '.ai';
}

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

export async function convertEpsAiToPng(input: Buffer): Promise<Buffer> {
  const { psBuffer, tiffBuffer } = extractPsOrTiffFromDosEps(input);

  // If there's an embedded TIFF thumbnail, try rendering it first with Sharp
  if (tiffBuffer && tiffBuffer.length > 0) {
    try {
      const png = await sharp(tiffBuffer).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
      if (png && png.length > 0) return png;
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
        '-r150',
        '-sDEVICE=png16m',
        `-sOutputFile=${outPath}`,
        inPath,
      ]);
      const res = await fs.readFile(outPath);
      if (res && res.length > 0) return res;
    } catch {
      // 2. Try Ghostscript without -dEPSCrop (e.g. AI / PDF)
      try {
        await execFileAsync('gs', [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          '-r150',
          '-sDEVICE=png16m',
          `-sOutputFile=${outPath}`,
          inPath,
        ]);
        const res = await fs.readFile(outPath);
        if (res && res.length > 0) return res;
      } catch {
        // 3. Try ImageMagick / convert
        try {
          await execFileAsync('convert', [
            '-density',
            '150',
            inPath,
            '-background',
            'white',
            '-flatten',
            outPath,
          ]);
          const res = await fs.readFile(outPath);
          if (res && res.length > 0) return res;
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

export async function imageDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
  } catch (e) {
    console.error('Image dimension detection failed:', e);
  }
  return null;
}
