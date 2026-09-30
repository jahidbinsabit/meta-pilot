/**
 * Shared contracts for the AI provider abstraction layer (PROMPT 12).
 *
 * The layer is deliberately thin: adapters translate a single `AiRequest`
 * into a provider API call and return a single `AiResponse`. The router
 * (`lib/ai/index.ts`) picks the adapter from the DB at call time so an admin
 * can switch a tool between Gemini and OpenAI with zero code deploys.
 */

import type { ZodType } from 'zod';

/** Image payload both adapters accept. */
export interface AiImage {
  /** Base64-encoded image bytes (no data-URL prefix). */
  data: string;
  /** MIME type, e.g. "image/png". */
  mimeType: string;
}

/** One input to `generateWithAI`. */
export interface AiRequest {
  toolSlug: string;
  systemPrompt: string;
  userPrompt: string;
  imageUrls?: string[];
  /** Optional Zod schema. When set, the response is parsed & validated and
   *  `parsed` is returned typed. Schema mismatch → null + logged, never thrown. */
  responseSchema?: ZodType;
  /** Name of the responseSchema, used for the structured-output KPI. */
  responseSchemaName?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Number of attempts on a schema mismatch before giving up. Default 2. */
  maxRetries?: number;
}

/** Token usage reported by the provider. */
export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Result of one `generateWithAI` call. */
export interface AiResponse<T = unknown> {
  raw: string;
  parsed: T | null;
  parsedOk?: boolean;
  usage: AiUsage;
  provider: string;
  model: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  attempts?: number;
}

/** The adapter interface both providers implement. */
export interface AiAdapter {
  readonly id: string;
  readonly name: string;
  generate(req: AiRequest): Promise<AiResponse>;
  healthcheck(): Promise<boolean>;
}

/** Provider config as surfaced by the config layer. */
export interface ProviderConfig {
  provider: string;
  enabled: boolean;
  apiKey?: string;
  modelDefault: string;
  customApiUrl?: string;
  customHeaders?: Record<string, string>;
  apiType?: string;
  costPer1kIn: number;
  costPer1kOut: number;
  maxTokens: number;
  priority?: number;
}

/** Row written to `AiCallLog` for every `generateWithAI` invocation. */
export interface AiCallLogEntry {
  toolSlug: string;
  provider: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  errorMessage?: string;
  responseSchema?: string;
  parsedOk: boolean;
}
