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

/** Check whether admin requires all users to provide their own API key. */
export async function isUserApiKeyRequired(): Promise<boolean> {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 'default' },
      select: { userApiKeyRequired: true },
    });
    return !!settings?.userApiKeyRequired;
  } catch {
    return false;
  }
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

/** Get decrypted keys for backend execution. */
export async function getUserAiKeysDecrypted(userId: string) {
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

  const geminiKey = user.geminiApiKey ? decryptSecret(user.geminiApiKey).trim() : undefined;
  const grokKey = user.grokApiKey ? decryptSecret(user.grokApiKey).trim() : undefined;
  const openaiKey = user.openaiApiKey ? decryptSecret(user.openaiApiKey).trim() : undefined;
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
