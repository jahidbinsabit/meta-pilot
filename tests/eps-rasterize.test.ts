import { describe, it, expect } from 'vitest';
import { parseVectorPageSizePoints, rasterDpiFor } from '@/lib/generator/images';

function buf(text: string): Buffer {
  return Buffer.from(text, 'latin1');
}

describe('parseVectorPageSizePoints', () => {
  it('reads a standard %%BoundingBox', () => {
    const size = parseVectorPageSizePoints(buf('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 595 842\n%%EndComments\n'));
    expect(size).toEqual({ widthPts: 595, heightPts: 842 });
  });

  it('prefers %%HiResBoundingBox with fractional points', () => {
    const size = parseVectorPageSizePoints(
      buf('%%BoundingBox: 0 0 100 100\n%%HiResBoundingBox: 0 0 612.5 792.25\n'),
    );
    expect(size?.widthPts).toBeCloseTo(612.5);
    expect(size?.heightPts).toBeCloseTo(792.25);
  });

  it('handles a non-zero origin', () => {
    const size = parseVectorPageSizePoints(buf('%%BoundingBox: -10 -20 90 180\n'));
    expect(size).toEqual({ widthPts: 100, heightPts: 200 });
  });

  it('ignores a "(atend)" BoundingBox instead of misparsing it', () => {
    const size = parseVectorPageSizePoints(buf('%%BoundingBox: (atend)\n%%EndComments\n'));
    expect(size).toBeNull();
  });

  it('reads a PDF /MediaBox for AI files', () => {
    const size = parseVectorPageSizePoints(buf('%PDF-1.5\n<< /MediaBox [0 0 612 792] >>\n'));
    expect(size).toEqual({ widthPts: 612, heightPts: 792 });
  });

  it('returns null for garbage', () => {
    expect(parseVectorPageSizePoints(buf('not a vector file at all'))).toBeNull();
    expect(parseVectorPageSizePoints(buf('%%BoundingBox: 0 0 0 0\n'))).toBeNull();
  });
});

describe('rasterDpiFor', () => {
  it('targets the long side: A4 portrait at 1280px lands near 109 DPI', () => {
    expect(rasterDpiFor({ widthPts: 595, heightPts: 842 }, 1280)).toBe(109);
  });

  it('drops DPI hard for a huge artboard (the old flat-150 slow case)', () => {
    // 5000pt long side at 150 DPI would render 10417px wide.
    expect(rasterDpiFor({ widthPts: 5000, heightPts: 5000 }, 1280)).toBe(18);
  });

  it('never exceeds the legacy 150 DPI for small files', () => {
    expect(rasterDpiFor({ widthPts: 100, heightPts: 100 }, 1280)).toBe(150);
  });

  it('never goes below 10 DPI', () => {
    expect(rasterDpiFor({ widthPts: 100000, heightPts: 10 }, 1280)).toBe(10);
  });

  it('falls back to 150 when the page size is unknown', () => {
    expect(rasterDpiFor(null, 1280)).toBe(150);
  });
});
