/**
 * Router: resolve the right adapter for a tool slug and run it.
 *
 * `generateWithAI` is the single entry point the rest of the codebase should
 * use. `generateAi` is kept for backwards compatibility with the older
 * `AiRequest` shape used by the existing routes; new code should use
 * `generateWithAI` with a Zod `responseSchema`.
 */

import { GeminiAdapter } from '@/lib/ai/gemini';
import { OpenAiAdapter } from '@/lib/ai/openai';
import { GrokAdapter } from '@/lib/ai/grok';
import { CustomAdapter } from '@/lib/ai/adapters/custom';
import { resolveUserAdapter, isUserApiKeyRequired } from '@/lib/ai/user-keys';
import type { AiAdapter, AiRequest, AiResponse, ProviderConfig } from '@/lib/ai/types';
import {
  getActiveProviderForTool,
  getProviderConfigForTool,
  getProviderConfigResolved,
  getToolProviderMap,
  getAllEnabledProviders,
} from '@/lib/ai/config';

/**
 * Generate with the provider configured for `toolSlug`.
 *
 * The provider + model are resolved from the DB at call time, so an admin
 * switching a tool's provider in the admin panel takes effect immediately.
 *
 * **Automatic Fallback**: If the primary provider fails with a retryable error
 * (503, rate limit, timeout), the system automatically tries the fallback provider.
 *
 * @param toolSlug        Canonical tool slug (see `lib/tools/slugs.ts`).
 * @param systemPrompt    System instruction.
 * @param userPrompt      User instruction.
 * @param imageUrls       Optional data-URL or http(s) image URLs.
 * @param responseSchema  Optional Zod schema. When supplied the response is
 *                        parsed and validated; `parsed` is typed and `parsedOk`
 *                        is reflected in the call log. Schema mismatch → null.
 */
export async function generateWithAI(opts: {
  toolSlug: string;
  systemPrompt: string;
  userPrompt: string;
  imageUrls?: string[];
  responseSchema?: any;
  responseSchemaName?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  /** Optional explicit provider override, used by admin connectivity tests. */
  provider?: string;
  /** Disable automatic fallback to alternative provider. */
  disableFallback?: boolean;
  /** User ID if calling on behalf of an authenticated user. */
  userId?: string;
}): Promise<AiResponse> {
  const req: AiRequest = {
    toolSlug: opts.toolSlug,
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    imageUrls: opts.imageUrls,
    responseSchema: opts.responseSchema,
    responseSchemaName: opts.responseSchemaName,
    model: opts.model,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    maxRetries: opts.maxRetries,
  };

  // If userId is provided, check for user-configured API keys first or if key is required
  if (opts.userId) {
    const userResolved = await resolveUserAdapter(opts.userId, opts.provider);
    if (userResolved) {
      console.log(`[AI Router] Using user-provided ${userResolved.provider} API key`);
      const result = await userResolved.adapter.generate(req);
      if (result.success || opts.disableFallback) {
        return result;
      }
      // If user key failed with retryable error, allow fallback to system providers
      if (result.errorMessage && isRetryableError(result.errorMessage)) {
        console.log(`[AI Router] User ${userResolved.provider} key failed with retryable error: ${result.errorMessage}, trying system fallbacks...`);
        // Continue to system providers below
      } else {
        // Non-retryable error (auth, quota, etc.) - inform user their key failed
        throw new Error(`[${userResolved.provider}] User API key failed: ${result.errorMessage}`);
      }
    }
  } else {
    // If no userId but API key is strictly required by admin
    const required = await isUserApiKeyRequired();
    if (required) {
      throw new Error('USER_API_KEY_REQUIRED: Admin has set API Key to required. Please configure your API key to continue.');
    }
  }

  // Try primary provider (Admin/System configured)
  const primaryProvider = opts.provider || (await getActiveProviderForTool(opts.toolSlug));
  try {
    const adapter = await getAdapterForTool(opts.toolSlug, opts.provider);
    const result = await adapter.generate(req);
    
    // If generation succeeded, return immediately
    if (result.success) {
      return result;
    }
    
    // If disabled fallback or no retryable error, return the failed result
    if (opts.disableFallback || !isRetryableError(result.errorMessage)) {
      return result;
    }
  } catch (error: any) {
    // If disabled fallback or no retryable error, throw
    if (opts.disableFallback || !isRetryableError(error?.message)) {
      throw error;
    }
    console.log(`[AI Router] Primary provider ${primaryProvider} failed: ${error?.message}, trying fallback...`);
  }

  // Try all other enabled providers in priority order
  const allProviders = await getAllEnabledProviders();
  const fallbackProviders = allProviders
    .filter(p => p.provider !== primaryProvider)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  
  // Try each fallback provider in order
  for (const fallbackConfig of fallbackProviders) {
    try {
      console.log(`[AI Router] Falling back to ${fallbackConfig.provider}...`);
      const fallbackAdapter = getAdapterForProvider(fallbackConfig);
      const fallbackResult = await fallbackAdapter.generate(req);
      
      if (fallbackResult.success) {
        console.log(`[AI Router] Fallback to ${fallbackConfig.provider} succeeded!`);
        return fallbackResult;
      }
    } catch (fallbackError: any) {
      console.error(`[AI Router] Fallback to ${fallbackConfig.provider} failed: ${fallbackError?.message}`);
      // Continue to next provider
    }
  }

  // All providers failed
  throw new Error(`All AI providers failed. Primary: ${primaryProvider}, tried ${fallbackProviders.length} fallbacks.`);
}

/**
 * Check if an error message indicates a retryable failure that should trigger fallback.
 */
function isRetryableError(errorMessage?: string): boolean {
  if (!errorMessage) return false;
  
  const retryablePatterns = [
    /503/i,                           // Service unavailable
    /high demand/i,                   // Gemini high demand
    /rate limit/i,                    // Rate limit exceeded
    /quota/i,                         // Quota exceeded
    /timeout/i,                       // Timeout
    /temporarily unavailable/i,       // Temporary unavailability
    /overloaded/i,                    // Server overloaded
    /try again later/i,               // Generic retry message
    /UNAVAILABLE/i,                   // gRPC unavailable status
  ];
  
  return retryablePatterns.some(pattern => pattern.test(errorMessage));
}

/**
 * Resolve the adapter for a tool slug. Throws if the provider has no API key
 * configured or is unknown — callers should catch and refund.
 */
export async function getAdapterForTool(
  toolSlug: string,
  providerOverride?: string,
): Promise<AiAdapter> {
  const cfg = providerOverride
    ? await getProviderConfigResolved(providerOverride)
    : await getProviderConfigForTool(toolSlug);
  return getAdapterForProvider(cfg);
}

/**
 * Create adapter instance from provider config
 */
function getAdapterForProvider(cfg: any): AiAdapter {
  switch (cfg.provider) {
    case 'gemini':
      return new GeminiAdapter(cfg.apiKey, cfg.modelDefault);
    case 'openai':
      return new OpenAiAdapter(cfg.apiKey, cfg.modelDefault);
    case 'grok':
      return new GrokAdapter(cfg.apiKey, cfg.modelDefault || 'grok-2-latest');
    default:
      // Custom / OpenAI-compatible provider (Groq, OpenRouter, DeepSeek, Together, etc.)
      return new CustomAdapter({
        providerId: cfg.provider,
        apiKey: cfg.apiKey,
        apiUrl: cfg.customApiUrl || 'https://api.openai.com/v1/chat/completions',
        model: cfg.modelDefault || 'gpt-3.5-turbo',
        apiType: cfg.apiType || 'openai',
        customHeaders: cfg.customHeaders,
        maxTokens: cfg.maxTokens,
      });
  }
}

// ---------------------------------------------------------------------------
// Backwards-compatible helpers
// ---------------------------------------------------------------------------

/**
 * Legacy entry point used by the existing routes. `toolSlug` defaults to
 * "metadata-generator" so the old `generateAi({ prompt, systemPrompt, json })`
 * shape keeps working while callers migrate to `generateWithAI`.
 *
 * @deprecated Use `generateWithAI` with a Zod `responseSchema` so callers
 * always get typed, validated data.
 */
export async function generateAi(req: {
  prompt: string;
  systemPrompt?: string;
  image?: { data: string; mimeType: string };
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): Promise<AiResponse> {
  const imageUrls = req.image ? [`data:${req.image.mimeType};base64,${req.image.data}`] : undefined;
  return generateWithAI({
    toolSlug: 'metadata-generator',
    systemPrompt: req.systemPrompt || '',
    userPrompt: req.prompt,
    imageUrls,
    model: req.model,
    maxTokens: req.maxTokens,
    temperature: req.temperature,
  });
}

export { getActiveProviderForTool, getProviderConfigForTool, getProviderConfigResolved, getToolProviderMap };

/** Health check across all configured providers. */
export async function healthCheckAll(): Promise<{ provider: string; ok: boolean }[]> {
  const allProviders = await getAllEnabledProviders();
  const out: { provider: string; ok: boolean }[] = [];
  
  for (const cfg of allProviders) {
    try {
      const adapter = getAdapterForProvider(cfg);
      out.push({ provider: cfg.provider, ok: await adapter.healthcheck() });
    } catch {
      out.push({ provider: cfg.provider, ok: false });
    }
  }
  return out;
}

// Re-export ProviderConfig for callers that need it.
export type { ProviderConfig };
