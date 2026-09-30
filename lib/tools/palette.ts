/**
 * Color palette extraction (PROMPT 10.3).
 *
 * Pure-client: quantize the image's colours with a median-cut-style
 * bucketing and return the dominant colours as hex/rgb. No network calls.
 */

export interface PaletteColor {
  hex: string;
  rgb: string;
  count: number;
  name?: string;
}

function hexOf(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

interface Bucket {
  r: [number, number];
  g: [number, number];
  b: [number, number];
  pixels: number[];
}

function splitBucket(bucket: Bucket): Bucket[] {
  const range = [bucket.r[1] - bucket.r[0], bucket.g[1] - bucket.g[0], bucket.b[1] - bucket.b[0]];
  const axis = range.indexOf(Math.max(...range));
  if (axis === -1 || bucket.pixels.length < 2) return [bucket];

  const mid = bucket.pixels.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (const p of bucket.pixels) {
    const v = [p & 255, (p >> 8) & 255, (p >> 16) & 255][axis];
    if (v <= mid) left.push(p);
    else right.push(p);
  }
  if (left.length === 0 || right.length === 0) return [bucket];

  const make = (pix: number[]): Bucket => {
    let r0 = 255,
      r1 = 0,
      g0 = 255,
      g1 = 0,
      b0 = 255,
      b1 = 0;
    for (const p of pix) {
      const r = p & 255;
      const g = (p >> 8) & 255;
      const b = (p >> 16) & 255;
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
      if (g < g0) g0 = g;
      if (g > g1) g1 = g;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    }
    return { r: [r0, r1], g: [g0, g1], b: [b0, b1], pixels: pix };
  };

  return [make(left), make(right)];
}

export function extractPalette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  colorCount = 8,
): PaletteColor[] {
  // Downsample: sample every Nth pixel for speed.
  const sampleEvery = Math.max(1, Math.floor(data.length / 4 / 20000));
  const buckets: Bucket[] = [
    {
      r: [0, 255],
      g: [0, 255],
      b: [0, 255],
      pixels: [],
    },
  ];

  for (let i = 0; i < data.length; i += 4 * sampleEvery) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (data[i + 3] < 128) continue; // skip transparent
    buckets[0].pixels.push((r << 16) | (g << 8) | b);
  }

  // Median-cut to colorCount buckets.
  while (buckets.length < colorCount) {
    let biggest = 0;
    let biggestSize = 0;
    for (let i = 0; i < buckets.length; i++) {
      const span =
        buckets[i].r[1] -
        buckets[i].r[0] +
        (buckets[i].g[1] - buckets[i].g[0]) +
        (buckets[i].b[1] - buckets[i].b[0]);
      if (span > biggestSize) {
        biggestSize = span;
        biggest = i;
      }
    }
    const [b] = buckets.splice(biggest, 1);
    const parts = splitBucket(b);
    buckets.push(...parts);
  }

  const out: PaletteColor[] = [];
  for (const b of buckets) {
    if (b.pixels.length === 0) continue;
    let rSum = 0,
      gSum = 0,
      bSum = 0;
    for (const p of b.pixels) {
      rSum += p & 255;
      gSum += (p >> 8) & 255;
      bSum += (p >> 16) & 255;
    }
    const r = rSum / b.pixels.length;
    const g = gSum / b.pixels.length;
    const b2 = bSum / b.pixels.length;
    out.push({
      hex: hexOf(r, g, b2),
      rgb: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b2)})`,
      count: b.pixels.length,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
