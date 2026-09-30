/**
 * Dithering algorithms (PROMPT 10.9).
 *
 * Pure-client implementations of the three classic dither modes:
 *  - "floyd-steinberg" — error diffusion, the canonical 4-tap kernel
 *  - "ordered"         — Bayer matrix dithering
 *  - "none"            — straight thresholding
 */

export type DitherMode = 'floyd-steinberg' | 'ordered' | 'none';

export interface DitherOptions {
  mode: DitherMode;
  levels: number; // 2..256 quantization levels per channel
  matrixSize: 4 | 8; // Bayer matrix order (ordered mode only)
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export function applyDither(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: DitherOptions,
): { data: Uint8ClampedArray; width: number; height: number } {
  const { mode, levels } = opts;
  const out = new Uint8ClampedArray(data.length);
  const step = 255 / Math.max(1, levels - 1);

  if (mode === 'none') {
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.round(Math.round(data[i + c] / step) * step);
      }
      out[i + 3] = data[i + 3];
    }
    return { data: out, width, height };
  }

  // Work on a copy so we can diffuse error in place.
  const buf = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) buf[i] = data[i];

  if (mode === 'floyd-steinberg') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const old = buf[i + c];
          const neu = Math.round(Math.round(old / step) * step);
          out[i + c] = neu;
          const err = old - neu;
          const n1 = x + 1 < width ? i + 4 + c : -1;
          const n2 = y + 1 < height ? i + width * 4 + c : -1;
          const n3 = y + 1 < height && x - 1 >= 0 ? i + width * 4 - 4 + c : -1;
          const n4 = y + 1 < height && x + 1 < width ? i + width * 4 + 4 + c : -1;
          if (n1 >= 0) buf[n1] += (err * 7) / 16;
          if (n2 >= 0) buf[n2] += (err * 5) / 16;
          if (n3 >= 0) buf[n3] += (err * 3) / 16;
          if (n4 >= 0) buf[n4] += (err * 1) / 16;
        }
      }
    }
    for (let i = 3; i < data.length; i += 4) out[i] = data[i];
    return { data: out, width, height };
  }

  // Ordered (Bayer) dithering.
  const matrix = opts.matrixSize === 8 ? BAYER_8 : BAYER_4;
  const n = matrix.length;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const threshold = (matrix[y % n][x % n] / (n * n)) * step;
      for (let c = 0; c < 3; c++) {
        const v = Math.max(0, Math.min(255, buf[i + c] + (threshold - step / 2)));
        out[i + c] = Math.round(Math.round(v / step) * step);
      }
      out[i + 3] = data[i + 3];
    }
  }
  return { data: out, width, height };
}
