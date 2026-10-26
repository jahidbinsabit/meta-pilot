/**
 * Layered PSD builder (PROMPT 10.10).
 *
 * Writes a REAL Photoshop PSD via ag-psd (pure JS writer — no
 * node-canvas needed when layers are supplied as raw `imageData`):
 *   - "Subject" layer: the chroma-key cutout's RGBA pixels
 *     (same deterministic corner-sample algorithm as bg-remover)
 *   - "Background" layer: the original image pixels
 * The document composite (`imageData`) is the original image, so the
 * flattened preview matches the source. Output starts with the "8BPS"
 * signature. (Audit R6 / N4 — previously this returned a PNG composite
 * saved with a .psd filename.)
 */

import sharp from 'sharp';
import { writePsdBuffer, type Psd } from 'ag-psd';
import { removeBackground } from '@/lib/tools/bg-remover';

interface RawPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

async function toRawPixels(png: Buffer): Promise<RawPixels> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
  };
}

/**
 * Total-pixel ceiling. The byte size of an upload says nothing about its
 * decoded size — a small, highly-compressible file can expand to hundreds
 * of megabytes of raw RGBA (this builder holds ~3 full pixel buffers at
 * once). 50 MP bounds worst-case memory to roughly 600 MB while covering
 * any realistic stock-content image.
 */
const MAX_TOTAL_PIXELS = 50_000_000;

export async function buildLayeredPsd(input: Buffer): Promise<Buffer> {
  try {
    // 0. Pixel ceiling BEFORE any full decode: read header metadata only
    // and reject oversized images. The throw lands in the caller's normal
    // failure path (credits refunded, tool returns its failure response).
    const meta = await sharp(input).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width > 0 && height > 0 && width * height > MAX_TOTAL_PIXELS) {
      throw new Error(
        `Image is too large for PSD conversion: ${width}x${height} is ${Math.round(
          (width * height) / 1_000_000,
        )} MP — the limit is ${MAX_TOTAL_PIXELS / 1_000_000} MP`,
      );
    }

    // 1. Normalize to PNG, then decode the original pixels (Background).
    const normalized = await sharp(input).png().toBuffer();
    const background = await toRawPixels(normalized);

    // 2. Subject layer: chroma-key cutout of the same image, decoded raw.
    const subjectPng = await removeBackground(normalized);
    const subject = await toRawPixels(subjectPng);
    if (subject.width !== background.width || subject.height !== background.height) {
      throw new Error('Subject layer size does not match the source image');
    }

    // 3. Emit a true layered PSD. Children are listed top layer first:
    // Subject sits above Background; the composite is the original image.
    const psd: Psd = {
      width: background.width,
      height: background.height,
      imageData: {
        width: background.width,
        height: background.height,
        data: background.data,
      },
      children: [
        {
          name: 'Subject',
          imageData: {
            width: subject.width,
            height: subject.height,
            data: subject.data,
          },
        },
        {
          name: 'Background',
          imageData: {
            width: background.width,
            height: background.height,
            data: background.data,
          },
        },
      ],
    };
    return writePsdBuffer(psd);
  } catch (e: any) {
    throw new Error(`PSD building failed: ${e.message}`);
  }
}
