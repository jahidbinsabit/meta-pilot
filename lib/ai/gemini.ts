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
import { ownedImageKey, resolveLocalUploadPath } from '@/lib/ai/image-ref';
import { fetchBufferSafe } from '@/lib/net/safe-fetch';
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
    // Use gemini-3.5-flash-lite (original behavior).
    let model = req.model || this.modelDefault || 'gemini-3.5-flash-lite';
    if (model === 'gemini-2.0-flash' || model === 'gemini-3.8-flash') {
      model = 'gemini-3.5-flash-lite';
    }
    return this.doGenerateWithModel(req, model);
  }

  private async doGenerateWithModel(
    req: AiRequest,
    model: string,
  ): Promise<{
    text: string;
    promptTokens: number;
    completionTokens: number;
    finishReason?: string;
  }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const parts: any[] = [];
    if (req.systemPrompt) parts.push({ text: req.systemPrompt });
    parts.push({ text: req.userPrompt });

    const images = req.imageUrls ?? [];
    for (const url of images) {
      const { data, mimeType } = await toInlineImage(url, req.userId);
      parts.push({ inline_data: { mime_type: mimeType, data } });
    }

    const generationConfig: any = {
      maxOutputTokens: Math.max(req.maxTokens ?? 8192, 1024),
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
      // Don't hang forever if the provider stalls; the retry loop treats
      // timeouts as retryable.
      signal: AbortSignal.timeout(60000),
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
    
    const text = textParts || candidateParts.map((p: any) => p.text || '').join('').trim();
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

const INLINE_IMAGE_MIME: Record<string, string> = {
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

function mimeForRef(ref: string): string {
  const ext = ref.split('.').pop()?.toLowerCase() || 'jpeg';
  return INLINE_IMAGE_MIME[ext] || 'image/jpeg';
}

/**
 * Accept either a data: URL (`data:image/png;base64,...`), local /uploads path, /api/s3/<key>, raw key, or a remote URL.
 * Gemini wants inline base64, so URLs and keys are resolved and inlined.
 *
 * Hardened (audit R9, S9-02): the resolver is safe regardless of caller —
 * local reads must resolve inside `public/uploads` (`..` escapes are
 * rejected), storage keys must be a well-formed `uploads/<userId>/…` or
 * `previews/<userId>/…` key owned by `userId`, and remote URLs go through
 * `fetchBufferSafe` (SSRF public-IP validation, guarded redirects,
 * streamed 10MB cap) instead of a bare fetch.
 */
async function toInlineImage(
  url: string,
  userId?: string,
): Promise<{ data: string; mimeType: string }> {
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
      const filename = decodeURIComponent(uploadsMatch[1]);
      // Reject anything that resolves outside public/uploads.
      const filePath = resolveLocalUploadPath(filename);
      if (!filePath) {
        console.warn('[toInlineImage] local path escapes uploads dir, skipping');
      } else {
        buf = await fs.readFile(filePath);
        mime = mimeForRef(filename);
      }
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
        // Only the caller's own uploads/previews objects may be pulled.
        const key = ownedImageKey(userId, rawKey);
        if (!key) {
          console.warn('[toInlineImage] storage key not owned by caller, skipping');
        } else {
          const { downloadFile } = await import('@/lib/s3/client');
          buf = await downloadFile(key);
          mime = mimeForRef(key);
        }
      } catch (err) {
        console.warn('[toInlineImage] direct S3 download failed:', err);
      }
    }
  }

  // 4. Raw S3 key (uploads/... or previews/...)
  if (!buf && (url.startsWith('uploads/') || url.startsWith('previews/'))) {
    try {
      const key = ownedImageKey(userId, url);
      if (!key) {
        console.warn('[toInlineImage] raw key not owned by caller, skipping');
      } else {
        const { downloadFile } = await import('@/lib/s3/client');
        buf = await downloadFile(key);
        mime = mimeForRef(key);
      }
    } catch (err) {
      console.warn('[toInlineImage] raw key download failed:', err);
    }
  }

  // 5. External HTTP(S) URL — SSRF-guarded fetch (public IPs only,
  // redirects re-validated per hop, body stream-capped at 10MB).
  if (!buf && /^https?:\/\//i.test(url)) {
    try {
      const fetched = await fetchBufferSafe(url, { maxBytes: 10 * 1024 * 1024 });
      mime = fetched.contentType || 'image/jpeg';
      buf = fetched.buffer;
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
