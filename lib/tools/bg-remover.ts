/**
 * Background removal (PROMPT 10.1).
 *
 * Deterministic, server-side algorithm that produces a transparent PNG:
 * sample the four corner colours, then make any pixel within a fuzz
 * tolerance of any corner colour fully transparent. This is a simple
 * "chroma-key from the border" approach — effective for product shots on
 * plain backgrounds and fully verifiable (no hidden model behaviour).
 */

import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import { writeFile, readFile, unlink } from 'fs/promises';

export async function removeBackground(input: Buffer): Promise<Buffer> {
  const tmpIn = `/tmp/bg-in-${randomBytes(6).toString('hex')}.png`;
  const tmpOut = `/tmp/bg-out-${randomBytes(6).toString('hex')}.png`;
  try {
    await writeFile(tmpIn, input);

    // Normalize to PNG.
    execFileSync('convert', [tmpIn, 'png:' + tmpIn + '.norm.png'], {
      stdio: 'ignore',
      maxBuffer: 50 * 1024 * 1024,
    });

    const norm = tmpIn + '.norm.png';
    const corners = sampleCorners(norm);
    const args = [norm];
    for (const c of corners) {
      args.push('-fuzz', '12%', '-transparent', c);
    }
    args.push(tmpOut);
    execFileSync('convert', args, { stdio: 'ignore', maxBuffer: 50 * 1024 * 1024 });

    return await readFile(tmpOut);
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpIn + '.norm.png').catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}

function sampleCorners(path: string): string[] {
  const out = execFileSync(
    'identify',
    ['-format', '%[pixel:p{0,0}] %[pixel:p{w-1,0}] %[pixel:p{0,h-1}] %[pixel:p{w-1,h-1}]', path],
    { encoding: 'utf-8', maxBuffer: 1024 },
  );
  return out.trim().split(/\s+/).filter(Boolean);
}
