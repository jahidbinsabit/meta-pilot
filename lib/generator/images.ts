import { spawn } from 'child_process';
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

/** Convert an EPS/AI file to a PNG raster preview via Ghostscript. */
export async function rasterizeVectorToPng(input: Buffer, ext: '.eps' | '.ai'): Promise<Buffer> {
  const tmpIn = `/tmp/gs-in-${randomBytes(6).toString('hex')}${ext}`;
  const tmpOut = `/tmp/gs-out-${randomBytes(6).toString('hex')}.png`;
  await import('fs/promises').then(async (fs) => {
    await fs.writeFile(tmpIn, input);
  });

  const args = [
    '-q',
    '-dNOPAUSE',
    '-dBATCH',
    '-sDEVICE=png16m',
    '-r150',
    '-dFirstPage=1',
    '-dLastPage=1',
    '-sOutputFile=' + tmpOut,
    tmpIn,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn('gs', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Ghostscript failed (code ${code}): ${err.slice(0, 300)}`));
      else resolve();
    });
  });

  const fs = await import('fs/promises');
  const png = await fs.readFile(tmpOut);
  await fs.unlink(tmpIn).catch(() => {});
  await fs.unlink(tmpOut).catch(() => {});
  return png;
}

/** Resize a raster image to a max dimension and compress for preview + AI vision payload. */
export async function resizeImage(
  input: Buffer,
  mime: string,
  maxDim = 1024,
  quality = 80,
): Promise<{ buffer: Buffer; width: number; height: number; mime: string }> {
  // Use ImageMagick `convert` if available, else pass-through.
  const hasConvert = await commandExists('convert');
  if (!hasConvert) return { buffer: input, width: 0, height: 0, mime };
  const out = `/tmp/resize-${randomBytes(6).toString('hex')}.jpg`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'convert',
      ['-', '-auto-orient', '-resize', `${maxDim}x${maxDim}>`, '-quality', `${quality}`, '-strip', out],
      {
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    );
    child.stdin.end(input);
    let err = '';
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', async (code) => {
      if (code !== 0) return reject(new Error(`convert failed: ${err.slice(0, 200)}`));
      resolve();
    });
  });
  const fs = await import('fs/promises');
  const buf = await fs.readFile(out);
  await fs.unlink(out).catch(() => {});
  const dims = await imageDimensions(buf);
  return { buffer: buf, width: dims?.width ?? 0, height: dims?.height ?? 0, mime: 'image/jpeg' };
}

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('which', [cmd], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/** Upload a processed preview to S3 and return its public URL + dimensions. */
export async function storePreview(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mime: string,
): Promise<{ key: string; url: string }> {
  const key = `previews/${userId}/${Date.now()}-${randomBytes(4).toString('hex')}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)}`;
  await uploadImage(key, buffer, mime);
  return { key, url: publicUrl(key) };
}

/** Best-effort dimensions via ImageMagick identify. */
export async function imageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number } | null> {
  const hasIdentify = await commandExists('identify');
  if (!hasIdentify) return null;
  const tmp = `/tmp/ident-${randomBytes(6).toString('hex')}`;
  const fs = await import('fs/promises');
  await fs.writeFile(tmp, buffer);
  return new Promise((resolve) => {
    const child = spawn('identify', ['-format', '%w %h', tmp], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', () => resolve(null));
    child.on('close', async () => {
      await fs.unlink(tmp).catch(() => {});
      const m = out.trim().match(/(\d+)\s+(\d+)/);
      if (m) resolve({ width: Number(m[1]), height: Number(m[2]) });
      else resolve(null);
    });
  });
}
