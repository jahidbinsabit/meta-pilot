import { describe, it, expect } from 'vitest';

import { extractPalette } from '@/lib/tools/palette';

// ---------------------------------------------------------------------------
// extractPalette — median-cut palette extraction (regression tests for the
// T3-01 infinite loop: splitBucket compared channel values 0–255 against
// half the pixel COUNT, so buckets never split and the cut loop spun
// forever on any real image). If the bug returns, these tests hang and
// fail on the vitest timeout instead of passing.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

/** Build an RGBA pixel buffer programmatically — no image files needed. */
function makeImage(
  width: number,
  height: number,
  fill: (x: number, y: number) => RGB,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = fill(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('extractPalette', () => {
  it('terminates on a large few-colour image and returns only the colours present', () => {
    // 800×600 = 480k pixels in three solid bands — the audit's hang case.
    const data = makeImage(800, 600, (x) =>
      x < 200 ? [255, 0, 0] : x < 500 ? [0, 255, 0] : [0, 0, 255],
    );
    const palette = extractPalette(data, 800, 600, 8);

    expect(palette).toHaveLength(3);
    expect(palette.map((c) => c.hex).sort()).toEqual(['#0000ff', '#00ff00', '#ff0000']);
    // Sorted by descending pixel count.
    const counts = palette.map((c) => c.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('returns fewer colours than requested when the image has fewer distinct colours', () => {
    // 20×20 two-colour image — the audit's second hang trigger.
    const data = makeImage(20, 20, (x) => (x < 10 ? [10, 20, 30] : [200, 210, 220]));
    const palette = extractPalette(data, 20, 20, 8);

    expect(palette).toHaveLength(2);
    expect(palette.map((c) => c.hex).sort()).toEqual(['#0a141e', '#c8d2dc']);
  });

  it('returns the full requested count for a many-colour image', () => {
    const data = makeImage(120, 120, (x, y) => [(x * 2) % 256, (y * 2) % 256, (x + y) % 256]);
    const palette = extractPalette(data, 120, 120, 8);

    expect(palette).toHaveLength(8);
    for (const c of palette) {
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.count).toBeGreaterThan(0);
    }
  });

  it('keeps the red and blue channels straight', () => {
    const data = makeImage(10, 10, () => [255, 0, 0]);
    const palette = extractPalette(data, 10, 10, 8);

    expect(palette).toHaveLength(1);
    expect(palette[0].hex).toBe('#ff0000');
    expect(palette[0].rgb).toBe('rgb(255, 0, 0)');
  });

  it('returns an empty palette for a fully transparent image', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4); // alpha 0 everywhere
    expect(extractPalette(data, 10, 10, 8)).toEqual([]);
  });
});
