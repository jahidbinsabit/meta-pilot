/**
 * xAI Grok adapter.
 *
 * Uses the xAI Chat Completions API (OpenAI-compatible).
 * Supports Grok 2, Grok 2 Vision, Grok Beta, etc.
 */

import { zodToJsonSchema } from '@/lib/ai/json-schema';
import { BaseAdapter } from '@/lib/ai/base';
import type { AiRequest } from '@/lib/ai/types';

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

export class GrokAdapter extends BaseAdapter {
  readonly id = 'grok' as const;
  readonly name = 'xAI Grok';

  constructor(
    private apiKey: string,
    private modelDefault: string = 'grok-2-latest',
  ) {
    super();
  }

  protected override defaultModelName(): string {
    return this.modelDefault || 'grok-2-latest';
  }

  async doGenerate(req: AiRequest): Promise<{
    text: string;
    promptTokens: number;
    completionTokens: number;
    finishReason?: string;
  }> {
    let model = req.model || this.modelDefault || 'grok-2-latest';
    const imageUrls = req.imageUrls ?? [];

    // If images are provided and default model is non-vision, switch to vision model if needed
    if (imageUrls.length > 0 && (model === 'grok-2' || model === 'grok-2-latest' || model === 'grok-beta')) {
      model = 'grok-2-vision-1212';
    }

    const messages: any[] = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }

    if (imageUrls.length > 0) {
      const content: any[] = [{ type: 'text', text: req.userPrompt }];
      for (const url of imageUrls) {
        content.push({
          type: 'image_url',
          image_url: { url },
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
      // Grok supports json_object response_format
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey.trim()}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      let errorMsg = err;
      try {
        const parsed = JSON.parse(err);
        errorMsg = parsed.error?.message || parsed.message || err;
      } catch {}

      if (res.status === 401) {
        throw new Error('xAI Grok API 401: Invalid API key.');
      }
      if (res.status === 429) {
        throw new Error('xAI Grok API 429: Rate limit exceeded.');
      }
      throw new Error(`xAI Grok API ${res.status}: ${errorMsg.slice(0, 300)}`);
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
      const res = await fetch('https://api.x.ai/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey.trim()}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
