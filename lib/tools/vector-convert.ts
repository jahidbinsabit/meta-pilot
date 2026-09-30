/**
 * Vector → raster conversion (PROMPT 10.7).
 *
 * Wraps Ghostscript (EPS/AI) and ImageMagick (SVG) so the AI/EPS to JPG
 * tool can convert any vector format to a raster JPG server-side.
 */

import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import { writeFile, readFile, unlink } from 'fs/promises';

export interface ConvertResult {
  buffer: Buffer;
  mime: string;
}

export async function convertVectorToJpg(input: Buffer, maxDim = 2000): Promise<ConvertResult> {
  const ext = detectExt(input);
  const tmpIn = `/tmp/conv-in-${randomBytes(6).toString('hex')}${ext}`;
  const tmpOut = `/tmp/conv-out-${randomBytes(6).toString('hex')}.jpg`;
  try {
    await writeFile(tmpIn, input);

    if (ext === '.svg') {
      execFileSync(
        'convert',
        ['-background', 'white', tmpIn, '-resize', `${maxDim}x${maxDim}>`, tmpOut],
        {
          stdio: 'ignore',
          maxBuffer: 50 * 1024 * 1024,
        },
      );
    } else {
      // EPS / AI via Ghostscript.
      execFileSync(
        'gs',
        [
          '-q',
          '-dNOPAUSE',
          '-dBATCH',
          '-sDEVICE=jpeg',
          '-dJPEGQ=92',
          '-r150',
          '-dFirstPage=1',
          '-dLastPage=1',
          '-sOutputFile=' + tmpOut,
          tmpIn,
        ],
        { stdio: 'ignore', maxBuffer: 50 * 1024 * 1024 },
      );
    }

    const buf = await readFile(tmpOut);
    return { buffer: buf, mime: 'image/jpeg' };
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}

function detectExt(input: Buffer): '.ai' | '.eps' | '.svg' {
  const head = input.toString('utf-8', 0, 64).trim();
  if (head.startsWith('%!PS') || head.startsWith('%!')) return '.eps';
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.toLowerCase().includes('<svg'))
    return '.svg';
  return '.ai';
}
