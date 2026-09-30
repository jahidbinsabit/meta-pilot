/**
 * Halftone dot filter (PROMPT 10.8).
 *
 * Pure-client algorithm: for each output cell, sample the source image at
 * the cell centre and scale the dot radius by the local luminance. Darker
 * pixels → larger dots. The dot is drawn as a filled circle on an
 * offscreen canvas.
 */

export interface HalftoneOptions {
  dotSize: number; // base radius in pixels
  angle: number; // screen angle in degrees
  colorMode: 'monochrome' | 'color';
}

export function applyHalftone(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: HalftoneOptions,
): { data: Uint8ClampedArray; width: number; height: number } {
  const { dotSize, angle, colorMode } = opts;
  const cell = Math.max(2, dotSize * 2);
  const out = new Uint8ClampedArray(data.length);
  // Start from transparent white background.
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = 255;
  }

  const cosA = Math.cos((angle * Math.PI) / 180);
  const sinA = Math.sin((angle * Math.PI) / 180);

  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      // Sample luminance at the cell centre.
      const cx = Math.min(width - 1, x + cell / 2);
      const cy = Math.min(height - 1, y + cell / 2);
      const idx = (cy * width + cx) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; // 0..1
      const radius = Math.max(0.5, (1 - lum) * (cell / 2 - 0.5));

      // Apply screen angle by rotating the dot centre within the cell.
      const dx = cx - width / 2;
      const dy = cy - height / 2;
      const rx = dx * cosA - dy * sinA;
      const ry = dx * sinA + dy * cosA;
      const ox = rx + width / 2;
      const oy = ry + height / 2;

      const px = Math.round(ox);
      const py = Math.round(oy);
      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const rr = Math.ceil(radius);
      for (let dy2 = -rr; dy2 <= rr; dy2++) {
        for (let dx2 = -rr; dx2 <= rr; dx2++) {
          if (dx2 * dx2 + dy2 * dy2 > radius * radius) continue;
          const sx = px + dx2;
          const sy = py + dy2;
          if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
          const oi = (sy * width + sx) * 4;
          if (colorMode === 'color') {
            out[oi] = r;
            out[oi + 1] = g;
            out[oi + 2] = b;
          } else {
            const gray = Math.round(lum * 255);
            out[oi] = gray;
            out[oi + 1] = gray;
            out[oi + 2] = gray;
          }
          out[oi + 3] = 255;
        }
      }
    }
  }
  return { data: out, width, height };
}
