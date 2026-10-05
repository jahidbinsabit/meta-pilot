import fs from 'fs/promises';
import path from 'path';

/**
 * Local filesystem fallback when S3/MinIO is unavailable.
 * Stores files in public/uploads and serves them via Next.js static files.
 */

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
}

export async function uploadFileLocal(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  await ensureUploadDir();
  
  const filePath = path.join(UPLOAD_DIR, key.replace(/\//g, '-'));
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  
  await fs.writeFile(filePath, buffer);
  
  const publicPath = `/uploads/${path.basename(filePath)}`;
  return { key, url: publicPath };
}

export async function downloadFileLocal(key: string): Promise<Buffer> {
  const filePath = path.join(UPLOAD_DIR, key.replace(/\//g, '-'));
  return fs.readFile(filePath);
}

export async function deleteFileLocal(key: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, key.replace(/\//g, '-'));
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // File might not exist
  }
}

export function publicUrlLocal(key: string): string {
  const fileName = key.replace(/\//g, '-');
  return `/uploads/${fileName}`;
}
