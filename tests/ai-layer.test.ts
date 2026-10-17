import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Pure-logic tests (no network / DB). These exercise the pieces of the AI
// layer that must be correct regardless of provider.
// ---------------------------------------------------------------------------

import { zodToJsonSchema } from '@/lib/ai/json-schema';
import { MetadataSchema, ImagePromptSchema, AdobeKeywordsSchema } from '@/lib/ai/schemas';

describe('zodToJsonSchema', () => {
  it('converts a basic object with required + optional fields', () => {
    const s: any = zodToJsonSchema(
      z.object({
        title: z.string(),
        keywords: z.array(z.string()),
        altText: z.string().optional(),
      }),
    );
    expect(s).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        altText: { type: 'string' },
      },
      required: ['title', 'keywords'],
    });
  });

  it('marks defaulted fields as optional', () => {
    const s: any = zodToJsonSchema(z.object({ mood: z.string().default('') }));
    expect(s.required).toBeUndefined();
    expect(s.properties.mood).toEqual({ type: 'string' });
  });

  it('handles enums and literals', () => {
    const s: any = zodToJsonSchema(
      z.object({
        level: z.enum(['low', 'medium', 'high']),
        id: z.literal('abc'),
      }),
    );
    expect(s.properties.level).toEqual({ enum: ['low', 'medium', 'high'] });
    expect(s.properties.id).toEqual({ type: 'string', const: 'abc' });
  });

  it('handles nested objects and arrays of objects', () => {
    const s: any = zodToJsonSchema(z.object({ items: z.array(z.object({ name: z.string() })) }));
    expect(s.properties.items).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    });
  });

  it('handles unions', () => {
    const s: any = zodToJsonSchema(z.object({ v: z.union([z.string(), z.number()]) }));
    expect(s.properties.v).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('returns {} for z.any / z.unknown', () => {
    const s: any = zodToJsonSchema(z.any());
    expect(s).toEqual({});
  });
});

describe('caller schemas', () => {
  it('MetadataSchema requires title/description/keywords', () => {
    expect(
      MetadataSchema.safeParse({ title: 'x', description: 'y', keywords: ['a'] }).success,
    ).toBe(true);
    expect(MetadataSchema.safeParse({ title: 'x', description: 'y', keywords: [] }).success).toBe(
      false,
    );
    expect(MetadataSchema.safeParse({ title: '', description: 'y', keywords: ['a'] }).success).toBe(
      false,
    );
  });

  it('ImagePromptSchema requires a non-empty prompt', () => {
    expect(ImagePromptSchema.safeParse({ prompt: 'a photo of a dog' }).success).toBe(true);
    expect(ImagePromptSchema.safeParse({ prompt: '' }).success).toBe(false);
  });

  it('AdobeKeywordsSchema requires at least one keyword', () => {
    expect(AdobeKeywordsSchema.safeParse({ keywords: ['dog'] }).success).toBe(true);
    expect(AdobeKeywordsSchema.safeParse({ keywords: [] }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Adapter tests with the provider HTTP call mocked.
// ---------------------------------------------------------------------------

import { GeminiAdapter } from '@/lib/ai/gemini';
import { OpenAiAdapter } from '@/lib/ai/openai';

function mockFetch(body: any, status = 200) {
  const json = vi.fn().mockResolvedValue(body);
  const text = vi.fn().mockResolvedValue(JSON.stringify(body));
  return vi.fn().mockResolvedValue({ ok: true, status, json, text });
}

describe('GeminiAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('enforces response_schema for structured output', async () => {
    const fetchMock = mockFetch({
      candidates: [
        { content: { parts: [{ text: '{"title":"hi","description":"d","keywords":["a"]}' }] } },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter('key', 'gemini-1.5-pro');
    const res = await adapter.generate({
      toolSlug: 'metadata-generator',
      systemPrompt: 'sys',
      userPrompt: 'user',
      responseSchema: MetadataSchema,
      responseSchemaName: 'Metadata',
    });

    expect(res.provider).toBe('gemini');
    expect(res.parsed).toEqual({ title: 'hi', description: 'd', keywords: ['a'], altText: '' });
    expect(res.usage.totalTokens).toBe(30);
    expect(res.success).toBe(true);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.response_mime_type).toBe('application/json');
    expect(body.generationConfig.response_schema).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        altText: { type: 'string' },
      },
      required: ['title', 'description', 'keywords'],
    });
  });

  it('returns parsed null and success false on schema mismatch', async () => {
    const fetchMock = mockFetch({
      candidates: [
        { content: { parts: [{ text: '{"title":123,"description":"d","keywords":["a"]}' }] } },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter('key', 'gemini-1.5-pro');
    const res = await adapter.generate({
      toolSlug: 'metadata-generator',
      systemPrompt: 'sys',
      userPrompt: 'user',
      responseSchema: MetadataSchema,
    });

    expect(res.parsed).toBeNull();
    expect(res.success).toBe(false);
    expect(res.raw).toContain('123');
  });

  it('strips markdown fences before parsing', async () => {
    const fetchMock = mockFetch({
      candidates: [
        {
          content: {
            parts: [{ text: '```json\n{"title":"x","description":"y","keywords":["a"]}\n```' }],
          },
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter('key', 'gemini-1.5-pro');
    const res = await adapter.generate({
      toolSlug: 'metadata-generator',
      systemPrompt: 'sys',
      userPrompt: 'user',
      responseSchema: MetadataSchema,
    });

    expect(res.parsed).toEqual({ title: 'x', description: 'y', keywords: ['a'], altText: '' });
    expect(res.success).toBe(true);
  });

  it('retries on a transient provider error then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: vi.fn(),
        text: vi.fn().mockResolvedValue('busy'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          candidates: [
            { content: { parts: [{ text: '{"title":"ok","description":"d","keywords":["a"]}' }] } },
          ],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
        }),
        text: vi.fn(),
      });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter('key', 'gemini-1.5-pro');
    const res = await adapter.generate({
      toolSlug: 'metadata-generator',
      systemPrompt: 'sys',
      userPrompt: 'user',
      responseSchema: MetadataSchema,
      maxRetries: 3,
    });

    expect(res.success).toBe(true);
    expect(res.attempts).toBe(2);
  });
});

describe('OpenAiAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses json_schema response_format when a schema is supplied', async () => {
    const fetchMock = mockFetch({
      choices: [
        {
          message: { content: '{"title":"hi","description":"d","keywords":["a"]}' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 7 },
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAiAdapter('key', 'gpt-4o');
    const res = await adapter.generate({
      toolSlug: 'metadata-generator',
      systemPrompt: 'sys',
      userPrompt: 'user',
      responseSchema: MetadataSchema,
      responseSchemaName: 'Metadata',
    });

    expect(res.provider).toBe('openai');
    expect(res.parsed).toEqual({ title: 'hi', description: 'd', keywords: ['a'], altText: '' });
    expect(res.usage.totalTokens).toBe(12);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('Metadata');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.type).toBe('object');
  });

  it('sends images as image_url content parts', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: '{"prompt":"p","subject":"s"}', finish_reason: 'stop' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAiAdapter('key', 'gpt-4o');
    await adapter.generate({
      toolSlug: 'image-to-prompt',
      systemPrompt: 'sys',
      userPrompt: 'user',
      imageUrls: ['data:image/png;base64,abc'],
      responseSchema: ImagePromptSchema,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content[0]).toEqual({ type: 'text', text: 'user' });
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc' },
    });
  });

  it('returns parsed null on schema mismatch', async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: '{"title":123}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAiAdapter('key', 'gpt-4o');
    const res = await adapter.generate({
      toolSlug: 'metadata-generator',
      systemPrompt: 'sys',
      userPrompt: 'user',
      responseSchema: MetadataSchema,
    });

    expect(res.parsed).toBeNull();
    expect(res.success).toBe(false);
  });
});
