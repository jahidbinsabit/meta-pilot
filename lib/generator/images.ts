import sharp from 'sharp';
import { randomBytes } from 'crypto';
import { uploadImage, publicUrl } from '@/lib/s3/client';
import { prisma } from '@/lib/db';

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
    // Sharp's librsvg handles SVG directly
    const png = await sharp(input)
      .png()
      .toBuffer();
    return png;
  } catch (e: any) {
    console.error('SVG conversion failed:', e);
    throw new Error('SVG conversion failed: ' + e.message);
  }
}

export async function extractOrCreatePreviewFromPostScript(input: Buffer): Promise<Buffer> {
  const placeholder = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 220, g: 220, b: 220 } },
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
    // First check if input is valid
    if (!input || input.length === 0) {
      throw new Error('Empty input buffer');
    }

    let image = sharp(input);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }
    
    const width = metadata.width;
    const height = metadata.height;
    
    // Resize if needed
    image = sharp(input)
      .rotate() // Auto-orient based on EXIF
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });
    
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
