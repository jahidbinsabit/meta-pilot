/**
 * Custom AI Adapter - supports any OpenAI-compatible API (Groq, OpenRouter, DeepSeek, Together, Ollama, Anthropic proxy, etc.)
 */
import { BaseAdapter } from '@/lib/ai/base';
import type { AiRequest } from '@/lib/ai/types';

export interface CustomAdapterConfig {
  providerId?: string;
  apiKey?: string;
  apiUrl: string;
  model: string;
  apiType?: string;
  customHeaders?: Record<string, string> | string | null;
  maxTokens?: number;
}

export class CustomAdapter extends BaseAdapter {
  readonly id: string;
  readonly name: string;
  private config: CustomAdapterConfig;

  constructor(config: CustomAdapterConfig) {
    super();
    this.id = config.providerId || 'custom';
    this.name = (config.providerId || 'Custom').toUpperCase();
    this.config = {
      apiType: 'openai',
      ...config,
    };
  }

  protected override defaultModelName(): string {
    return this.config.model || 'gpt-3.5-turbo';
  }

  private normalizeUrl(rawUrl: string): string {
    const url = (rawUrl || '').trim().replace(/\/+$/, '');
    if (!url) {
      return 'https://api.openai.com/v1/chat/completions';
    }
    if (this.config.apiType === 'openai' || !this.config.apiType) {
      if (url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/chat/completions`;
      if (url.includes('/chat/completions')) return url;
      try {
        const parsed = new URL(url);
        if (parsed.pathname === '' || parsed.pathname === '/') {
          return `${url}/v1/chat/completions`;
        }
      } catch {}
    }
    return url;
  }

  private buildHeaders(): Record<string, string> {
    let extraHeaders: Record<string, string> = {};
    if (typeof this.config.customHeaders === 'string' && this.config.customHeaders.trim()) {
      try {
        extraHeaders = JSON.parse(this.config.customHeaders);
      } catch {}
    } else if (this.config.customHeaders && typeof this.config.customHeaders === 'object') {
      extraHeaders = this.config.customHeaders as Record<string, string>;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey.trim()}` } : {}),
      ...extraHeaders,
    };

    return headers;
  }

  async doGenerate(req: AiRequest): Promise<{
    text: string;
    promptTokens: number;
    completionTokens: number;
    finishReason?: string;
  }> {
    const model = req.model || this.config.model || 'gpt-3.5-turbo';
    const targetUrl = this.normalizeUrl(this.config.apiUrl);
    const headers = this.buildHeaders();

    const messages: any[] = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }

    // Handle images for vision models
    const imageUrls = req.imageUrls ?? [];
    if (imageUrls.length > 0) {
      const content: any[] = [{ type: 'text', text: req.userPrompt }];
      for (const url of imageUrls) {
        content.push({ type: 'image_url', image_url: { url } });
      }
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: req.userPrompt });
    }

    const body: any = {
      model,
      messages,
      max_tokens: req.maxTokens ?? this.config.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
    };

    if (req.responseSchema) {
      body.response_format = { type: 'json_object' };
    }

    let res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // If 400 Bad Request and response_format was included, retry without response_format
    if (!res.ok && res.status === 400 && body.response_format) {
      delete body.response_format;
      res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      let parsedMessage = errText;
      try {
        const json = JSON.parse(errText);
        parsedMessage = json.error?.message || json.message || json.detail || errText;
      } catch {}
      throw new Error(`[${this.id}] API error (${res.status}): ${parsedMessage.slice(0, 300)}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const text = choice?.message?.content ?? choice?.text ?? '';
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
      const targetUrl = this.normalizeUrl(this.config.apiUrl);
      const headers = this.buildHeaders();
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 10,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
