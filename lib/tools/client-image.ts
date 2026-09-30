/**
 * Client-side image processing helpers (PROMPT 10).
 *
 * Several of the creative micro-tools (color palette, halftone, dither,
 * ASCII, PSD layering) run entirely in the browser. This module wraps the
 * repetitive bits — drawing an image onto an offscreen canvas, reading
 * pixels back, and exporting the canvas as a PNG Blob — so each tool can
 * stay small and focused on its own algorithm.
 */

export interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Draw a File, canvas, or URL-backed image into an offscreen canvas. */
export async function loadPixels(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | File | string,
): Promise<PixelData> {
  let img: HTMLImageElement | HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) {
    img = source;
  } else if (source instanceof HTMLImageElement) {
    img = source;
  } else if (source instanceof File) {
    img = await loadImageFromBlob(source);
  } else if (typeof source === 'string') {
    img = await loadImageFromUrl(source);
  } else {
    // ImageBitmap
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    img = canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { data, width: canvas.width, height: canvas.height };
}

export function loadImageFromBlob(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Draw a PixelData back onto a fresh canvas and return the canvas. */
export function pixelsToCanvas(pixels: PixelData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(pixels.data as any, pixels.width, pixels.height), 0, 0);
  return canvas;
}

/** Export a canvas as a PNG Blob. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

/** Trigger a download of a Blob under the given filename. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Convert a canvas to a data URL (PNG). */
export function canvasToDataURL(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Compress and downscale a raster image (JPEG, PNG, WebP) in the browser
 * before upload. Preserves aspect ratio with max dimension capped at maxDim (default 1024px)
 * and exports as JPEG with specified quality (default 0.78).
 * If the input is not a raster image (e.g. SVG/EPS/AI), returns the original File unchanged.
 */
export async function compressImageForUpload(
  file: File,
  maxDim = 1024,
  quality = 0.78,
): Promise<File> {
  const ext = ('.' + (file.name.split('.').pop() || '')).toLowerCase();
  const rasterExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

  // Only compress raster images
  if (!rasterExts.includes(ext) && !file.type.startsWith('image/')) {
    return file;
  }

  // Vectors should not be compressed with canvas
  if (ext === '.svg' || file.type === 'image/svg+xml' || ext === '.eps' || ext === '.ai') {
    return file;
  }

  try {
    const img = await loadImageFromBlob(file);
    let { width, height } = img;

    if (width <= 0 || height <= 0) return file;

    // Downscale if any dimension exceeds maxDim
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.max(1, Math.round((height * maxDim) / width));
        width = maxDim;
      } else {
        width = Math.max(1, Math.round((width * maxDim) / height));
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // White background for transparent PNGs
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    if (!blob) return file;

    // If compressed blob is somehow larger than original (rare, e.g. tiny icon), keep original
    if (blob.size >= file.size && width === img.width && height === img.height) {
      return file;
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const newName = `${baseName}.jpg`;

    return new File([blob], newName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('Image compression fallback:', err);
    return file;
  }
}

/** Resize a PixelData to fit within maxDim while preserving aspect ratio. */
export function resizePixels(pixels: PixelData, maxDim: number): PixelData {
  if (pixels.width <= maxDim && pixels.height <= maxDim) return pixels;
  const scale = Math.min(maxDim / pixels.width, maxDim / pixels.height);
  const w = Math.max(1, Math.round(pixels.width * scale));
  const h = Math.max(1, Math.round(pixels.height * scale));
  const canvas = pixelsToCanvas(pixels);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(canvas, 0, 0, w, h);
  return {
    data: ctx.getImageData(0, 0, w, h).data,
    width: w,
    height: h,
  };
}

