/**
 * Background removal (PROMPT 10.1).
 *
 * Vercel-compatible background removal using sharp + manual pixel analysis.
 * Samples corner colors and makes similar pixels transparent (chroma-key).
 */

import sharp from 'sharp';

export async function removeBackground(input: Buffer): Promise<Buffer> {
  try {
    // Get image info and pixel data
    const image = sharp(input);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    
    if (channels !== 4) {
      throw new Error('Expected RGBA image data');
    }

    // Sample corner pixels for background color detection
    const corners = [
      getPixelRGBA(data, 0, 0, width, channels),                    // top-left
      getPixelRGBA(data, width - 1, 0, width, channels),           // top-right  
      getPixelRGBA(data, 0, height - 1, width, channels),          // bottom-left
      getPixelRGBA(data, width - 1, height - 1, width, channels),  // bottom-right
    ];

    // Create new buffer with transparent background
    const newData = Buffer.from(data);
    const fuzzThreshold = 30; // ~12% of 255

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = getPixelRGBA(data, x, y, width, channels);
        
        // Check if pixel matches any corner color (within fuzz tolerance)
        const matchesCorner = corners.some(corner => 
          Math.abs(pixel.r - corner.r) <= fuzzThreshold &&
          Math.abs(pixel.g - corner.g) <= fuzzThreshold &&
          Math.abs(pixel.b - corner.b) <= fuzzThreshold
        );

        if (matchesCorner) {
          // Make pixel transparent
          const idx = (y * width + x) * channels + 3; // alpha channel
          newData[idx] = 0;
        }
      }
    }

    // Create PNG with transparent background
    return sharp(newData, { 
      raw: { width, height, channels: 4 } 
    }).png().toBuffer();

  } catch (e: any) {
    throw new Error(`Background removal failed: ${e.message}`);
  }
}

function getPixelRGBA(data: Buffer, x: number, y: number, width: number, channels: number) {
  const idx = (y * width + x) * channels;
  return {
    r: data[idx],
    g: data[idx + 1], 
    b: data[idx + 2],
    a: data[idx + 3] || 255
  };
}
