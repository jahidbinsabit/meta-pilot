import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  gif: 'image/gif',
  eps: 'image/eps',
  ai: 'application/illustrator',
};

export async function GET(
  req: Request,
  { params }: { params: { file: string[] } }
) {
  try {
    const rawSegments = params.file || [];
    const filename = rawSegments.map(decodeURIComponent).join('/');
    const cleanName = path.basename(filename);
    
    // Safety check: prohibit path traversal
    if (filename.includes('..') || cleanName !== filename) {
      return new Response('Forbidden', { status: 403 });
    }

    const filePath = path.join(process.cwd(), 'public', 'uploads', cleanName);
    const buffer = await fs.readFile(filePath);

    const ext = cleanName.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return new Response('File not found', { status: 404 });
    }
    return new Response('Internal error', { status: 500 });
  }
}
