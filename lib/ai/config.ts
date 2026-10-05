import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import type { ProviderConfig } from '@/lib/ai/types';

/**
 * Resolve the provider + model for a tool slug at call time.
 *
 * Routing precedence (PROMPT 12 / PROMPT 9.6):
 *   1. `AiProviderConfig.isActiveForToolSlug[toolSlug]` — admin per-tool map.
 *   2. The globally-active provider (first enabled row).
 *   3. `ACTIVE_AI_PROVIDER` env var.
 *   4. "gemini".
 *
 * The lookup is always live (DB read per call) so an admin panel change
 * takes effect on the very next generation — no deploy required.
 */
export async function getToolProviderMap(): Promise<Record<string, string>> {
  const configs = await prisma.aiProviderConfig.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  for (const cfg of configs) {
    if (cfg?.isActiveForToolSlug) {
      const raw = cfg.isActiveForToolSlug as unknown;
      if (raw && typeof raw === 'object') {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof v === 'string' && v.trim()) out[k] = v.trim();
        }
        if (Object.keys(out).length > 0) {
          return out;
        }
      }
    }
  }
  return {};
}

export async function getActiveProviderForTool(toolSlug: string): Promise<string> {
  const map = await getToolProviderMap();
  if (map[toolSlug]) return map[toolSlug];

  const cfg = await prisma.aiProviderConfig.findFirst({
    where: { enabled: true },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  });
  return cfg?.provider || process.env.ACTIVE_AI_PROVIDER || 'gemini';
}

export async function getActiveProvider(): Promise<string> {
  const cfg = await prisma.aiProviderConfig.findFirst({
    where: { enabled: true },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  });
  return cfg?.provider || process.env.ACTIVE_AI_PROVIDER || 'gemini';
}

function getEnvironmentApiKey(provider: string): string | undefined {
  if (provider === 'gemini') return process.env.GEMINI_API_KEY?.trim() || undefined;
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim() || undefined;
  if (provider === 'grok' || provider === 'xai') return process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim() || undefined;
  return undefined;
}

export async function getProviderConfig(provider: string): Promise<ProviderConfig> {
  const clean = provider.trim().toLowerCase();
  const cfg = await prisma.aiProviderConfig.findUnique({ where: { provider: clean } });
  if (cfg) {
    let model = cfg.modelDefault || '';
    if (clean === 'gemini' && (!model || model === 'gemini-2.0-flash')) {
      model = 'gemini-3.8-flash';
    }
    return {
      provider: cfg.provider,
      enabled: cfg.enabled,
      // A non-empty DB key is authoritative. Environment keys are fallback only.
      apiKey: cfg.apiKey || getEnvironmentApiKey(clean),
      modelDefault: model,
      customApiUrl: cfg.customApiUrl || undefined,
      customHeaders: (cfg.customHeaders as Record<string, string>) || undefined,
      apiType: cfg.apiType || 'openai',
      costPer1kIn: cfg.costPer1kIn,
      costPer1kOut: cfg.costPer1kOut,
      maxTokens: cfg.maxTokens,
      priority: cfg.priority || 0,
    };
  }
  if (clean === 'gemini') {
    return {
      provider: 'gemini',
      enabled: true,
      apiKey: process.env.GEMINI_API_KEY,
      modelDefault: 'gemini-3.8-flash',
      costPer1kIn: Number(process.env.GEMINI_COST_IN || 0),
      costPer1kOut: Number(process.env.GEMINI_COST_OUT || 0),
      maxTokens: 2048,
      priority: 0,
    };
  }
  if (clean === 'openai') {
    return {
      provider: 'openai',
      enabled: true,
      apiKey: process.env.OPENAI_API_KEY,
      modelDefault: 'gpt-4o',
      costPer1kIn: Number(process.env.OPENAI_COST_IN || 0),
      costPer1kOut: Number(process.env.OPENAI_COST_OUT || 0),
      maxTokens: 2048,
      priority: 0,
    };
  }
  if (clean === 'grok' || clean === 'xai') {
    return {
      provider: 'grok',
      enabled: true,
      apiKey: process.env.GROK_API_KEY || process.env.XAI_API_KEY,
      modelDefault: 'grok-2-latest',
      customApiUrl: 'https://api.x.ai/v1/chat/completions',
      costPer1kIn: 0,
      costPer1kOut: 0,
      maxTokens: 2048,
      priority: 0,
    };
  }
  throw new Error(`AI Provider "${provider}" is not configured in database or environment.`);
}

/**
 * Get provider config with decrypted API key for a specific provider name.
 */
export async function getProviderConfigResolved(
  provider: string,
): Promise<ProviderConfig & { apiKey: string }> {
  const cfg = await getProviderConfig(provider);
  if (!cfg.apiKey) {
    throw new Error(
      `No API key configured for AI provider "${provider}". Please add an API key in Admin → AI Providers.`,
    );
  }
  let key = cfg.apiKey;
  try {
    key = decryptSecret(cfg.apiKey);
  } catch {
    key = cfg.apiKey;
  }
  return { ...cfg, apiKey: key };
}

/**
 * Resolved provider config for a tool slug: provider, model, and decrypted API key.
 */
export async function getProviderConfigForTool(
  toolSlug: string,
): Promise<ProviderConfig & { apiKey: string }> {
  const provider = await getActiveProviderForTool(toolSlug);
  return getProviderConfigResolved(provider);
}

export async function listProviderConfigs(): Promise<(ProviderConfig & { hasKey: boolean })[]> {
  const rows = await prisma.aiProviderConfig.findMany({
    orderBy: [{ priority: 'desc' }, { provider: 'asc' }],
  });
  return rows.map((r: any) => ({
    provider: r.provider,
    enabled: r.enabled,
    // Never expose the raw/encrypted key to the client.
    // Use empty string so the input field stays blank (placeholder shows "••••••••").
    // hasKey tells the UI whether a key is currently stored.
    apiKey: '',
    // DB keys take priority; env keys are available when the DB row is empty.
    hasKey: !!(r.apiKey && r.apiKey.length > 0) || !!getEnvironmentApiKey(r.provider),
    modelDefault: r.modelDefault || '',
    customApiUrl: r.customApiUrl || undefined,
    customHeaders: (r.customHeaders as Record<string, string>) || undefined,
    apiType: r.apiType || 'openai',
    costPer1kIn: r.costPer1kIn,
    costPer1kOut: r.costPer1kOut,
    maxTokens: r.maxTokens,
    priority: r.priority || 0,
    isActiveForToolSlug: r.isActiveForToolSlug || undefined,
  }));
}

/**
 * Get all enabled providers sorted by priority (highest first) with decrypted keys.
 */
export async function getAllEnabledProviders(): Promise<any[]> {
  const rows = await prisma.aiProviderConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  });
  return rows.map((r: any) => ({
    provider: r.provider,
    enabled: r.enabled,
    apiKey: r.apiKey ? decryptSecret(r.apiKey) : undefined,
    modelDefault: r.modelDefault || '',
    customApiUrl: r.customApiUrl || undefined,
    customHeaders: (r.customHeaders as Record<string, string>) || undefined,
    apiType: r.apiType || 'openai',
    costPer1kIn: r.costPer1kIn,
    costPer1kOut: r.costPer1kOut,
    maxTokens: r.maxTokens,
    priority: r.priority || 0,
  }));
}
