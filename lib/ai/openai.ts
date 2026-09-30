/**
 * OpenAI adapter (PROMPT 12).
 *
 * Uses the Chat Completions API. Structured output is requested via
 * `response_format: { type: "json_schema", json_schema: { name, schema } }`
 * when a Zod schema is supplied, falling back to `json_object` for plain
 * JSON output. The Zod parse in `BaseAdapter` is the final gate.
 */

import { zodToJsonSchema } from '@/lib/ai/json-schema';
import { BaseAdapter } from '@/lib/ai/base';
import type { AiRequest } from '@/lib/ai/types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAiAdapter extends BaseAdapter {
  readonly id = 'openai' as const;
  readonly name = 'OpenAI';

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
    const model = req.model || this.modelDefault;

    const messages: any[] = [];
    if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });

    const imageUrls = req.imageUrls ?? [];
    if (imageUrls.length) {
      const content: any[] = [{ type: 'text', text: req.userPrompt }];
      for (const url of imageUrls) {
        content.push({
          type: 'image_url',
          image_url: { url: toOpenAiImageUrl(url) },
        });
      }
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: req.userPrompt });
    }

    const body: any = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
    };

    if (req.responseSchema) {
      const schemaName = req.responseSchemaName || 'response';
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          schema: zodToJsonSchema(req.responseSchema),
          strict: true,
        },
      };
    }
    // Only force JSON output if schema is provided
    // Plain text responses should not have response_format set

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      
      // Enhanced error messages for better debugging
      if (res.status === 429) {
        throw new Error(`OpenAI API 429: Rate limit exceeded. Please try again later.`);
      }
      if (res.status === 503) {
        throw new Error(`OpenAI API 503: Service temporarily unavailable. Please try again later.`);
      }
      if (res.status === 401) {
        throw new Error(`OpenAI API 401: Invalid API key.`);
      }
      
      throw new Error(`OpenAI API ${res.status}: ${err.slice(0, 400)}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const text = choice?.message?.content ?? '';
    const usage = data?.usage;
    return {
      text,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      finishReason: choice?.finish_reason,
    };
  }

  async healthcheck(): Promise<boolean> {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * OpenAI accepts either a data URL or a remote URL for image_url.
 * Remote URLs are passed through verbatim (OpenAI fetches them).
 */
function toOpenAiImageUrl(url: string): string {
  if (/^data:/i.test(url) || /^https?:\/\//i.test(url)) return url;
  throw new Error(
    `OpenAI adapter requires a data-URL or http(s) image URL, got: ${url.slice(0, 60)}`,
  );
}
