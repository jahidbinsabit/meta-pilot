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

export async function buildLayeredPsd(input: Buffer): Promise<Buffer> {
  try {
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
