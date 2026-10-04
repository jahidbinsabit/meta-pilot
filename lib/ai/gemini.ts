/**
 * Gemini adapter (PROMPT 12).
 *
 * Uses the Gemini REST API directly so we can pass a `response_schema` for
 * structured JSON output. Schema enforcement is requested via
 * `response_mime_type: application/json` + `response_schema`; the Zod parse
 * in `BaseAdapter` is the final gate (Gemini can still emit prose around the
 * schema, or fail the schema entirely).
 */

import { zodToJsonSchema } from '@/lib/ai/json-schema';
import { BaseAdapter } from '@/lib/ai/base';
import type { AiRequest } from '@/lib/ai/types';

export class GeminiAdapter extends BaseAdapter {
  readonly id = 'gemini' as const;
  readonly name = 'Google Gemini';

  constructor(
    private apiKey: string,
    private modelDefault: string,
  ) {
    super();
  }

  protected override defaultModelName(): string {
    return this.modelDefault;
  }

  async doGenerate(req: AiRequest): Promise<{
    text: string;
    promptTokens: number;
    completionTokens: number;
    finishReason?: string;
  }> {
    let model = req.model || this.modelDefault || 'gemini-3.8-flash';
    if (model === 'gemini-2.0-flash') {
      model = 'gemini-3.8-flash';
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const parts: any[] = [];
    if (req.systemPrompt) parts.push({ text: req.systemPrompt });
    parts.push({ text: req.userPrompt });

    const images = req.imageUrls ?? [];
    for (const url of images) {
      const { data, mimeType } = await toInlineImage(url);
      parts.push({ inline_data: { mime_type: mimeType, data } });
    }

    const generationConfig: any = {
      maxOutputTokens: req.maxTokens ?? 8192,
      temperature: req.temperature ?? 0.7,
    };

    if (req.responseSchema) {
      generationConfig.response_mime_type = 'application/json';
      generationConfig.response_schema = zodToJsonSchema(req.responseSchema);
    } else {
      generationConfig.response_mime_type = 'text/plain';
    }

    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API ${res.status}: ${err.slice(0, 400)}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const candidateParts: any[] = candidate?.content?.parts || [];
    
    // Extract non-thought text parts (Gemini 2.5/3.x models emit thought parts when thinking is enabled)
    const textParts = candidateParts
      .filter((p: any) => !p.thought && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('');
    
    const text = textParts || candidateParts[0]?.text || '';
    if (!text) {
      throw new Error(
        `Gemini returned no generated content (finish reason: ${candidate?.finishReason ?? 'unknown'}).`,
      );
    }
    const usage = data?.usageMetadata;
    return {
      text,
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      finishReason: data?.candidates?.[0]?.finishReason,
    };
  }

  async healthcheck(): Promise<boolean> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Accept either a data: URL (`data:image/png;base64,...`), local /uploads path, /api/s3/<key>, raw key, or a remote URL.
 * Gemini wants inline base64, so URLs and keys are resolved and inlined.
 */
async function toInlineImage(url: string): Promise<{ data: string; mimeType: string }> {
  if (!url || typeof url !== 'string') {
    throw new Error('Image URL is required');
  }

  // 1. Data URL
  const match = /^data:([^;]+);base64,(.+)$/i.exec(url);
  if (match) return { mimeType: match[1], data: match[2] };

  let buf: Buffer | null = null;
  let mime = 'image/jpeg';

  // 2. Local uploads path (/uploads/... or http(s)://.../uploads/...)
  const uploadsMatch = url.match(/\/uploads\/([^?#]+)/);
  if (uploadsMatch) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filename = decodeURIComponent(uploadsMatch[1]);
      const filePath = path.join(process.cwd(), 'public', 'uploads', filename);
      buf = await fs.readFile(filePath);
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpeg';
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        // Vector files rasterized to PNG — keep as PNG for AI vision
        svg: 'image/png',
        eps: 'image/png',
        ai: 'image/png',
      };
      mime = mimeMap[ext] || 'image/jpeg';
    } catch (err) {
      console.warn('[toInlineImage] local file read failed:', err);
    }
  }

  // 3. Internal S3 proxy URL (/api/s3/... or http(s)://.../api/s3/...)
  if (!buf) {
    const s3Match = url.match(/\/api\/s3\/(.+)$/);
    if (s3Match) {
      try {
        const rawKey = decodeURIComponent(s3Match[1]);
        const { downloadFile } = await import('@/lib/s3/client');
        buf = await downloadFile(rawKey);
        const ext = rawKey.split('.').pop()?.toLowerCase() || 'jpeg';
        const mimeMap: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
          gif: 'image/gif',
          svg: 'image/png',
          eps: 'image/png',
          ai: 'image/png',
        };
        mime = mimeMap[ext] || 'image/jpeg';
      } catch (err) {
        console.warn('[toInlineImage] direct S3 download failed:', err);
      }
    }
  }

  // 4. Raw S3 key (uploads/... or previews/...)
  if (!buf && (url.startsWith('uploads/') || url.startsWith('previews/'))) {
    try {
      const { downloadFile } = await import('@/lib/s3/client');
      buf = await downloadFile(url);
      const ext = url.split('.').pop()?.toLowerCase() || 'jpeg';
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        svg: 'image/png',
        eps: 'image/png',
        ai: 'image/png',
      };
      mime = mimeMap[ext] || 'image/jpeg';
    } catch (err) {
      console.warn('[toInlineImage] raw key download failed:', err);
    }
  }

  // 5. External HTTP(S) URL
  if (!buf && /^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        mime = res.headers.get('content-type') || 'image/jpeg';
        buf = Buffer.from(await res.arrayBuffer());
      } else {
        console.warn(`[toInlineImage] fetch ${url} returned ${res.status}`);
      }
    } catch (err) {
      console.warn('[toInlineImage] remote fetch failed:', err);
    }
  }

  if (buf) {
    try {
      const { resizeImage } = await import('@/lib/generator/images');
      const resized = await resizeImage(buf, mime, 1024, 80);
      return { mimeType: resized.mime, data: resized.buffer.toString('base64') };
    } catch {
      return { mimeType: mime.split(';')[0].trim(), data: buf.toString('base64') };
    }
  }

  throw new Error(
    `Gemini adapter could not resolve image from: ${url.slice(0, 80)}`,
  );
}
