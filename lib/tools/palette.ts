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

interface Bucket {
  r: [number, number];
  g: [number, number];
  b: [number, number];
  pixels: number[];
}

/**
 * Packed pixel layout everywhere in this module: (r << 16) | (g << 8) | b.
 * Split axis 0 = red (high byte), 1 = green, 2 = blue (low byte).
 */
function channelOf(p: number, axis: number): number {
  return axis === 0 ? (p >> 16) & 255 : axis === 1 ? (p >> 8) & 255 : p & 255;
}

function makeBucket(pix: number[]): Bucket {
  let r0 = 255,
    r1 = 0,
    g0 = 255,
    g1 = 0,
    b0 = 255,
    b1 = 0;
  for (const p of pix) {
    const r = (p >> 16) & 255;
    const g = (p >> 8) & 255;
    const b = p & 255;
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if (g < g0) g0 = g;
    if (g > g1) g1 = g;
    if (b < b0) b0 = b;
    if (b > b1) b1 = b;
  }
  return { r: [r0, r1], g: [g0, g1], b: [b0, b1], pixels: pix };
}

function splitBucket(bucket: Bucket): Bucket[] {
  if (bucket.pixels.length < 2) return [bucket];

  // The channel with the largest range is the split axis.
  const ranges = [
    bucket.r[1] - bucket.r[0],
    bucket.g[1] - bucket.g[0],
    bucket.b[1] - bucket.b[0],
  ];
  const widest = Math.max(...ranges);
  if (widest <= 0) return [bucket]; // every pixel is the same colour — unsplittable

  const axis = ranges.indexOf(widest);
  // True median cut: sort the bucket's pixels by the split channel and
  // halve at the COUNT median, so both halves are non-empty whenever the
  // bucket holds ≥2 pixels spanning a non-zero channel range.
  const sorted = [...bucket.pixels].sort((a, b) => channelOf(a, axis) - channelOf(b, axis));
  const mid = Math.floor(sorted.length / 2);
  const left = sorted.slice(0, mid);
  const right = sorted.slice(mid);
  if (left.length === 0 || right.length === 0) return [bucket];

  return [makeBucket(left), makeBucket(right)];
}

export function extractPalette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  colorCount = 8,
): PaletteColor[] {
  // Downsample: sample every Nth pixel for speed.
  const sampleEvery = Math.max(1, Math.floor(data.length / 4 / 20000));
  const sampled: number[] = [];

  for (let i = 0; i < data.length; i += 4 * sampleEvery) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (data[i + 3] < 128) continue; // skip transparent
    sampled.push((r << 16) | (g << 8) | b);
  }
  if (sampled.length === 0) return [];

  // Median-cut. Keep splitting while any bucket still mixes colours —
  // stopping at exactly colorCount buckets would average mixed buckets
  // into blend colours that don't exist in the image. The bucket cap
  // (8× the request) bounds photo-like images, where buckets never turn
  // pure; the averaged output is then deduped by hex and cut to the top
  // colorCount by pixel count. Termination: a bucket is only chosen when
  // its total span is > 0, and such a bucket always splits into two
  // non-empty halves, so the bucket count strictly grows each round; once
  // every bucket holds a single colour no bucket qualifies and the loop
  // stops on its own.
  const buckets: Bucket[] = [makeBucket(sampled)];
  const MAX_BUCKETS = Math.max(colorCount * 8, colorCount);
  const MAX_SPLIT_ROUNDS = 4096;
  for (let round = 0; buckets.length < MAX_BUCKETS && round < MAX_SPLIT_ROUNDS; round++) {
    let biggest = -1;
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
    if (biggest === -1) break; // nothing splittable remains
    const [b] = buckets.splice(biggest, 1);
    const parts = splitBucket(b);
    if (parts.length < 2) {
      buckets.push(b);
      break;
    }
    buckets.push(...parts);
  }

  const out: PaletteColor[] = [];
  for (const b of buckets) {
    if (b.pixels.length === 0) continue;
    let rSum = 0,
      gSum = 0,
      bSum = 0;
    for (const p of b.pixels) {
      rSum += (p >> 16) & 255;
      gSum += (p >> 8) & 255;
      bSum += p & 255;
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
  // A colour group can be cut into several pure buckets — merge identical
  // hexes (summing pixel counts) so the palette lists each real colour
  // once, then keep the top colorCount by pixel count.
  const merged = new Map<string, PaletteColor>();
  for (const c of out) {
    const prev = merged.get(c.hex);
    if (prev) prev.count += c.count;
    else merged.set(c.hex, { ...c });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count).slice(0, colorCount);
}
