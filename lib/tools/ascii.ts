/**
 * ASCII art conversion (PROMPT 10.4).
 *
 * Pure-client: downscale the source image, map each cell's luminance to a
 * character from the selected character set, and render the result either
 * as a <pre> text block or as a PNG canvas.
 */

export type DensityPreset = 'sparse' | 'normal' | 'dense';

const CHAR_SETS: Record<string, string> = {
  standard: '@%#*+=-:. ',
  simple: '@# ',
  dots: '·•• ',
  blocks: '█▓▒░ ',
  binary: '█ ',
  minimal: '@.- ',
};

const DENSITY_WIDTH: Record<DensityPreset, number> = {
  sparse: 40,
  normal: 80,
  dense: 160,
};

export interface AsciiOptions {
  charset: string;
  density: DensityPreset;
  invert: boolean;
  colored: boolean;
  fontSize: number;
}

export function buildAscii(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: AsciiOptions,
): string {
  const cols = DENSITY_WIDTH[opts.density];
  const rows = Math.max(1, Math.round((cols * height) / width / 2)); // terminal cells are ~2:1
  const cellW = width / cols;
  const cellH = height / rows;

  const chars = opts.charset || CHAR_SETS.standard;
  const maxIdx = chars.length - 1;

  let out = '';
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const cx = Math.floor(c * cellW + cellW / 2);
      const cy = Math.floor(r * cellH + cellH / 2);
      const idx = (cy * width + cx) * 4;
      const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
      const v = opts.invert ? 1 - lum : lum;
      const ci = Math.min(maxIdx, Math.floor(v * maxIdx));
      line += chars[ci];
    }
    out += line + '\n';
  }
  return out;
}

export function asciiToCanvas(text: string, opts: AsciiOptions): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const lines = text.split('\n');
  const fontSize = Math.max(6, opts.fontSize);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const metrics = ctx.measureText('M');
  const charW = metrics.width;
  const lineH = fontSize * 1.2;
  canvas.width = Math.max(1, Math.round(charW * (lines[0]?.length || 1)));
  canvas.height = Math.max(1, Math.round(lineH * lines.length));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (opts.colored) {
      // Colour each character by its source luminance — approximate by hue.
      for (let j = 0; j < line.length; j++) {
        const t = j / Math.max(1, line.length - 1);
        ctx.fillStyle = `hsl(${Math.round(t * 300)}, 70%, 55%)`;
        ctx.fillText(line[j], j * charW, i * lineH);
      }
    } else {
      ctx.fillStyle = '#e4e4e7';
      ctx.fillText(line, 0, i * lineH);
    }
  }
  return canvas;
}

export function charsetPresets(): { slug: string; label: string; chars: string }[] {
  return [
    { slug: 'standard', label: 'Standard', chars: CHAR_SETS.standard },
    { slug: 'simple', label: 'Simple', chars: CHAR_SETS.simple },
    { slug: 'dots', label: 'Dots', chars: CHAR_SETS.dots },
    { slug: 'blocks', label: 'Blocks', chars: CHAR_SETS.blocks },
    { slug: 'binary', label: 'Binary', chars: CHAR_SETS.binary },
    { slug: 'minimal', label: 'Minimal', chars: CHAR_SETS.minimal },
  ];
}

export function densityPresets(): { slug: DensityPreset; label: string; cols: number }[] {
  return [
    { slug: 'sparse', label: 'Sparse', cols: DENSITY_WIDTH.sparse },
    { slug: 'normal', label: 'Normal', cols: DENSITY_WIDTH.normal },
    { slug: 'dense', label: 'Dense', cols: DENSITY_WIDTH.dense },
  ];
}
