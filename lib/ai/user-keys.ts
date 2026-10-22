import { prisma } from '@/lib/db';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { GeminiAdapter } from '@/lib/ai/gemini';
import { GrokAdapter } from '@/lib/ai/grok';
import { OpenAiAdapter } from '@/lib/ai/openai';
import type { AiAdapter } from '@/lib/ai/types';

export interface UserAiKeysPublicStatus {
  hasGemini: boolean;
  hasGrok: boolean;
  hasOpenai: boolean;
  hasAnyKey: boolean;
  preferredAiProvider: string;
  userApiKeyRequired: boolean;
}

// Tiny 30s TTL caches for the generate path — a batch of N images would
// otherwise re-query the DB N times for the same values. A 30s stale window
// for key changes is acceptable (generator settings cache 60s elsewhere).
// Disabled under the test runner, where per-test Prisma mocks must stay
// authoritative across calls.
const CACHE_TTL_MS = 30_000;
const CACHE_ENABLED = process.env.NODE_ENV !== 'test';
let apiKeyRequiredCache: { value: boolean; expiresAt: number } | null = null;

/** Check whether admin requires all users to provide their own API key. */
export async function isUserApiKeyRequired(): Promise<boolean> {
  // Cached for 30s — checked per image in a batch; key-requirement changes
  // from the admin panel take effect within 30s.
  const now = Date.now();
  if (CACHE_ENABLED && apiKeyRequiredCache && apiKeyRequiredCache.expiresAt > now) {
    return apiKeyRequiredCache.value;
  }
  let value = false;
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 'default' },
      select: { userApiKeyRequired: true },
    });
    value = !!settings?.userApiKeyRequired;
  } catch {
    value = false;
  }
  if (CACHE_ENABLED) {
    apiKeyRequiredCache = { value, expiresAt: now + CACHE_TTL_MS };
  }
  return value;
}

export interface UserApiKeyCheckResult {
  error: 'user_api_key_required';
  message: string;
}

/**
 * BYOK gate shared by all generation routes.
 *
 * Returns null when the request may proceed, or an error descriptor when the
 * admin requires user API keys (BYOK mode) and this user has none configured.
 * Callers format the response themselves (JSON vs SSE) to preserve each
 * route's existing response shape.
 */
export async function requireUserApiKeyIfNeeded(
  userId: string,
): Promise<UserApiKeyCheckResult | null> {
  const keyRequired = await isUserApiKeyRequired();
  if (!keyRequired) return null;
  const keysStatus = await getUserAiKeysStatus(userId);
  if (keysStatus.hasAnyKey) return null;
  return {
    error: 'user_api_key_required',
    message: 'API Key is required. Please configure your API key in Settings to continue.',
  };
}

/** Get public status of user AI keys (for UI consumption, no secret keys exposed). */
export async function getUserAiKeysStatus(userId: string): Promise<UserAiKeysPublicStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      geminiApiKey: true,
      grokApiKey: true,
      openaiApiKey: true,
      preferredAiProvider: true,
    },
  });

  const isRequired = await isUserApiKeyRequired();
  const hasGemini = !!(user?.geminiApiKey && user.geminiApiKey.trim());
  const hasGrok = !!(user?.grokApiKey && user.grokApiKey.trim());
  const hasOpenai = !!(user?.openaiApiKey && user.openaiApiKey.trim());

  return {
    hasGemini,
    hasGrok,
    hasOpenai,
    hasAnyKey: hasGemini || hasGrok || hasOpenai,
    preferredAiProvider: user?.preferredAiProvider || 'auto',
    userApiKeyRequired: isRequired,
  };
}

const userKeysCache = new Map<
  string,
  { value: Awaited<ReturnType<typeof loadUserAiKeysDecrypted>>; expiresAt: number }
>();

/** Get decrypted keys for backend execution (cached per user for 30s). */
export async function getUserAiKeysDecrypted(userId: string) {
  if (!CACHE_ENABLED) return loadUserAiKeysDecrypted(userId);
  const hit = userKeysCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await loadUserAiKeysDecrypted(userId);
  userKeysCache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function loadUserAiKeysDecrypted(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      geminiApiKey: true,
      grokApiKey: true,
      openaiApiKey: true,
      preferredAiProvider: true,
    },
  });

  if (!user) return { hasAnyKey: false };

  // Decrypt each key independently — a single bad/legacy-plaintext row must
  // not take down the whole lookup (fail-closed crypto throws on bad rows).
  // Falls back to the raw stored value, mirroring lib/ai/config.ts.
  const safeDecrypt = (v: string | null): string | undefined => {
    if (!v) return undefined;
    try {
      return decryptSecret(v).trim() || undefined;
    } catch {
      return v.trim() || undefined;
    }
  };
  const geminiKey = safeDecrypt(user.geminiApiKey);
  const grokKey = safeDecrypt(user.grokApiKey);
  const openaiKey = safeDecrypt(user.openaiApiKey);
  const preferredProvider = user.preferredAiProvider || 'auto';
  const hasAnyKey = !!(geminiKey || grokKey || openaiKey);

  return {
    geminiKey: geminiKey || undefined,
    grokKey: grokKey || undefined,
    openaiKey: openaiKey || undefined,
    preferredProvider,
    hasAnyKey,
  };
}

/**
 * Resolve an AI Adapter for a specific user.
 * If user has configured keys, returns the user's adapter.
 * If user has no keys:
 *   - If required: throws Error with code 'USER_API_KEY_REQUIRED'
 *   - If not required: returns null (caller will use system/admin adapter).
 */
export async function resolveUserAdapter(
  userId: string,
  preferredOverride?: string,
): Promise<{ adapter: AiAdapter; provider: string; isUserKey: boolean } | null> {
  const isRequired = await isUserApiKeyRequired();
  const userKeys = await getUserAiKeysDecrypted(userId);

  if (!userKeys.hasAnyKey) {
    if (isRequired) {
      throw new Error(
        'USER_API_KEY_REQUIRED: An API key is required by the administrator. Please configure your Gemini, Grok, or OpenAI API key in the API Key settings to continue.',
      );
    }
    return null;
  }

  let target = preferredOverride || userKeys.preferredProvider || 'auto';
  if (target === 'auto' || !target) {
    if (userKeys.geminiKey) target = 'gemini';
    else if (userKeys.grokKey) target = 'grok';
    else if (userKeys.openaiKey) target = 'openai';
  }

  if (target === 'gemini' && userKeys.geminiKey) {
    return { adapter: new GeminiAdapter(userKeys.geminiKey, 'gemini-3.5-flash-lite'), provider: 'gemini', isUserKey: true };
  }
  if (target === 'grok' && userKeys.grokKey) {
    return { adapter: new GrokAdapter(userKeys.grokKey, 'grok-2-latest'), provider: 'grok', isUserKey: true };
  }
  if (target === 'openai' && userKeys.openaiKey) {
    return { adapter: new OpenAiAdapter(userKeys.openaiKey, 'gpt-4o'), provider: 'openai', isUserKey: true };
  }

  // If preferred not available, pick whichever key the user has
  if (userKeys.geminiKey) {
    return { adapter: new GeminiAdapter(userKeys.geminiKey, 'gemini-3.5-flash-lite'), provider: 'gemini', isUserKey: true };
  }
  if (userKeys.grokKey) {
    return { adapter: new GrokAdapter(userKeys.grokKey, 'grok-2-latest'), provider: 'grok', isUserKey: true };
  }
  if (userKeys.openaiKey) {
    return { adapter: new OpenAiAdapter(userKeys.openaiKey, 'gpt-4o'), provider: 'openai', isUserKey: true };
  }

  if (isRequired) {
    throw new Error('USER_API_KEY_REQUIRED: Please configure your API key in the API Key settings.');
  }

  return null;
}
