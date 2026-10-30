/**
 * AI provider abstraction layer (PROMPT 12).
 *
 * Public surface:
 *   generateWithAI({ toolSlug, systemPrompt, userPrompt, imageUrls, responseSchema })
 *
 * Internally it looks up `AiProviderConfig` for the given `toolSlug` (admin
 * per-tool routing map, PROMPT 9.6) and delegates to a `GeminiAdapter` or
 * `OpenAiAdapter`. The adapter is resolved from the DB at call time, so an
 * admin can switch, e.g., the Image-to-Prompt tool from Gemini to OpenAI with
 * zero code deploys — the next generation call just uses the new provider.
 *
 * Every call is logged to `AiCallLog` (latency, tokens, success/failure) to
 * support the admin's "test provider" and error-rate KPIs.
 */

export {
  generateWithAI,
  generateAi,
  getAdapterForTool,
  getActiveProviderForTool,
  getProviderConfigForTool,
  getToolProviderMap,
  healthCheckAll,
} from '@/lib/ai/router';
export * from '@/lib/ai/types';
export * from '@/lib/ai/config';
export { zodToJsonSchema } from '@/lib/ai/json-schema';
