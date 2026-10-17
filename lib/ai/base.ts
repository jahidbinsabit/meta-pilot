/**
 * Shared base for `GeminiAdapter` / `OpenAiAdapter`.
 *
 * It owns the parts that are provider-agnostic:
 *   - timing the call (latency)
 *   - extracting the raw text from the provider response
 *   - parsing + validating the response against the caller's Zod schema
 *   - logging the call to `AiCallLog`
 *
 * Subclasses only implement `doGenerate`: turn an `AiRequest` into the raw
 * text the caller asked for.
 */

import { zodToJsonSchema } from '@/lib/ai/json-schema';
import { logAiCall } from '@/lib/ai/logging';
import type { AiAdapter, AiRequest, AiResponse } from '@/lib/ai/types';

export abstract class BaseAdapter implements AiAdapter {
  abstract readonly id: string;
  abstract readonly name: string;

  /** Provider-specific HTTP call. Returns the raw text body. */
  abstract doGenerate(req: AiRequest): Promise<{
    text: string;
    promptTokens: number;
    completionTokens: number;
    finishReason?: string;
  }>;

  abstract healthcheck(): Promise<boolean>;

  async generate(req: AiRequest): Promise<AiResponse> {
    const started = Date.now();
    const maxRetries = Math.max(1, req.maxRetries ?? 3);
    let lastError: string | undefined;
    let attempts = 0;
    let text = '';
    let promptTokens = 0;
    let completionTokens = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attempts = attempt;
      try {
        const result = await this.doGenerate(req);
        text = result.text;
        promptTokens = result.promptTokens;
        completionTokens = result.completionTokens;
        lastError = undefined;
        break;
      } catch (e: any) {
        lastError = e?.message || String(e);
        if (attempt >= maxRetries) break;
        // Back off with exponential delay before retrying a transient provider error (503 / 429 / network)
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await sleep(delayMs);
      }
    }

    const latencyMs = Date.now() - started;
    const usage = {
      promptTokens: promptTokens || 0,
      completionTokens: completionTokens || 0,
      totalTokens: (promptTokens || 0) + (completionTokens || 0),
    };

    // Parse + validate against the caller's schema. A schema mismatch is
    // logged as parsedOk=false but does NOT throw — the caller decides how to
    // handle it (retry, refund, fall back to raw text).
    let parsed: unknown = null;
    let parsedOk = false;
    if (req.responseSchema) {
      const parsedResult = parseAndValidate(text, req.responseSchema);
      parsed = parsedResult.value;
      parsedOk = parsedResult.ok;
    } else {
      parsed = text;
      parsedOk = true;
    }

    const success = !lastError && parsedOk;
    await logAiCall({
      toolSlug: req.toolSlug,
      provider: this.id,
      model: req.model || this.defaultModelName(),
      latencyMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      success,
      errorMessage: lastError,
      responseSchema: req.responseSchemaName,
      parsedOk,
    });

    return {
      raw: text,
      parsed: parsed as any,
      usage,
      provider: this.id,
      model: req.model || this.defaultModelName(),
      latencyMs,
      success,
      errorMessage: lastError,
      attempts,
    };
  }

  /** Subclasses may override to expose their configured default model. */
  protected defaultModelName(): string {
    return '';
  }
}

/** Strip a markdown code fence if the model wrapped its JSON in one. */
function extractJson(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) return fence[1].trim();
  return t;
}

/** Pull the first balanced JSON object out of a string. */
function extractFirstJson(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) return text.trim();
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.trim();
}

function parseAndValidate(text: string, schema: any): { value: unknown; ok: boolean } {
  const candidates = [text, extractJson(text), extractFirstJson(text)];
  let parsed: unknown = undefined;
  let lastErr: string | undefined;
  for (const c of candidates) {
    try {
      parsed = JSON.parse(c);
      break;
    } catch (e: any) {
      lastErr = e?.message;
    }
  }
  if (parsed === undefined) return { value: null, ok: false };

  const result = schema.safeParse(parsed);
  if (result.success) return { value: result.data, ok: true };

  // Coerce: some models emit numbers as strings, etc. Try a lenient parse
  // where we JSON-stringify the value and re-parse (handles "123" → 123).
  try {
    const reserialized = JSON.parse(JSON.stringify(parsed));
    const r2 = schema.safeParse(reserialized);
    if (r2.success) return { value: r2.data, ok: true };
  } catch {
    /* ignore */
  }

  return { value: null, ok: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
