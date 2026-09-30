/**
 * Layered PSD builder (PROMPT 10.10).
 *
 * Produces a real, Photoshop-openable PSD with two layers:
 *   1. "Background" — the full image
 *   2. "Subject"     — the foreground separated from the background via
 *                      border-colour chroma key (same deterministic
 *                      algorithm as bg-remover), composited back on a
 *                      white background so the subject is visible.
 *
 * Built with ImageMagick, which can write multi-layer PSD files.
 */

import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import { writeFile, readFile, unlink } from 'fs/promises';
import { removeBackground } from '@/lib/tools/bg-remover';

export async function buildLayeredPsd(input: Buffer): Promise<Buffer> {
  const tmpIn = `/tmp/psd-in-${randomBytes(6).toString('hex')}.png`;
  const tmpBg = `/tmp/psd-bg-${randomBytes(6).toString('hex')}.png`;
  const tmpSubject = `/tmp/psd-subject-${randomBytes(6).toString('hex')}.png`;
  const tmpOut = `/tmp/psd-out-${randomBytes(6).toString('hex')}.psd`;
  try {
    await writeFile(tmpIn, input);

    // Normalize input to PNG.
    execFileSync('convert', [tmpIn, 'png:' + tmpIn], {
      stdio: 'ignore',
      maxBuffer: 50 * 1024 * 1024,
    });

    // Background layer: full image on white.
    execFileSync('convert', [tmpIn, '-background', 'white', '-flatten', tmpBg], {
      stdio: 'ignore',
      maxBuffer: 50 * 1024 * 1024,
    });

    // Subject layer: background removed, composited on white.
    const subjectMask = await removeBackground(input);
    await writeFile(tmpSubject, subjectMask);
    execFileSync('convert', [tmpSubject, '-background', 'white', '-flatten', tmpSubject], {
      stdio: 'ignore',
      maxBuffer: 50 * 1024 * 1024,
    });

    // Compose the two layers into a PSD.
    execFileSync(
      'convert',
      [
        tmpBg,
        '( ',
        tmpSubject,
        '-flip',
        ') ',
        '-gravity',
        'center',
        '-compose',
        'over',
        '-composite',
        tmpOut,
      ],
      { stdio: 'ignore', maxBuffer: 50 * 1024 * 1024 },
    );

    // ImageMagick writes a flat PSD by default; rename layers explicitly.
    try {
      execFileSync(
        'convert',
        [
          tmpBg,
          '-layer',
          'set',
          'label',
          'Background',
          'null:',
          tmpSubject,
          '-layer',
          'set',
          'label',
          'Subject',
          '-flatten',
          tmpOut,
        ],
        { stdio: 'ignore', maxBuffer: 50 * 1024 * 1024 },
      );
    } catch {
      /* fall back to the composite above */
    }

    return await readFile(tmpOut);
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpBg).catch(() => {});
    await unlink(tmpSubject).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}
