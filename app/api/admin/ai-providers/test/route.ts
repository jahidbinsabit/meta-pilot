import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { rateLimit } from '@/lib/rate-limit';
import { generateWithAI, getAdapterForProvider, getProviderConfigResolved } from '@/lib/ai/index';

/**
 * POST /api/admin/ai-providers/test
 *
 * Admin-only endpoint to test any AI provider with a simple prompt.
 * Returns latency, response text, and any error messages.
 *
 * T4-58: accepts an optional `draft` ({ apiKey, modelDefault, customApiUrl,
 * apiType, customHeaders, maxTokens }) — the provider card's UNSAVED edits.
 * When present, the test runs against the draft config (falling back to the
 * saved key when the draft leaves the key field untouched) instead of
 * silently testing the saved config. Draft tests call the adapter directly,
 * so they don't write AiCallLog rows.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin();

    // R9 S9-04: every test spends a live provider request — cap per admin.
    const rl = rateLimit(`admin-ai-providers-test:${admin.id}`, {
      max: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

    const body = await req.json();
    const { provider, draft } = body || {};

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Invalid provider. Provider name is required.' },
        { status: 400 },
      );
    }

    const cleanProvider = provider.trim().toLowerCase();
    const startMs = Date.now();

    try {
      if (draft && typeof draft === 'object') {
        // Draft path: effective config = saved config overridden by the
        // draft fields the admin actually changed.
        let saved: Awaited<ReturnType<typeof getProviderConfigResolved>> | null = null;
        let savedError: string | null = null;
        try {
          saved = await getProviderConfigResolved(cleanProvider);
        } catch (e: any) {
          savedError = e?.message || 'Provider is not configured.';
        }

        const draftKey =
          typeof draft.apiKey === 'string' &&
          draft.apiKey.trim() &&
          draft.apiKey.trim() !== 'configured' &&
          !draft.apiKey.trim().startsWith('••••')
            ? draft.apiKey.trim()
            : undefined;

        if (!draftKey && (savedError || !saved)) {
          return NextResponse.json({
            ok: false,
            latencyMs: Date.now() - startMs,
            error: savedError || 'Provider is not configured.',
            response: '',
          });
        }

        const base = saved ?? {
          provider: cleanProvider,
          enabled: true,
          modelDefault: '',
          costPer1kIn: 0,
          costPer1kOut: 0,
          maxTokens: 4096,
          customApiUrl: null,
          apiType: 'openai',
          customHeaders: null,
          // Never actually read: with no saved config the route has already
          // returned unless a draft key exists, and the draft key wins below.
          apiKey: '',
        };
        const adapter = getAdapterForProvider({
          ...base,
          provider: cleanProvider,
          apiKey: draftKey || base.apiKey,
          modelDefault:
            typeof draft.modelDefault === 'string' && draft.modelDefault.trim()
              ? draft.modelDefault.trim()
              : base.modelDefault,
          customApiUrl:
            typeof draft.customApiUrl === 'string' ? draft.customApiUrl.trim() : base.customApiUrl,
          apiType:
            typeof draft.apiType === 'string' && draft.apiType.trim()
              ? draft.apiType.trim()
              : base.apiType,
          customHeaders: draft.customHeaders !== undefined ? draft.customHeaders : base.customHeaders,
          maxTokens: typeof draft.maxTokens === 'number' ? draft.maxTokens : base.maxTokens,
        });

        const result = await adapter.generate({
          toolSlug: 'admin-provider-test',
          systemPrompt: 'You are an AI connectivity test assistant.',
          userPrompt: 'Respond with "OK" only.',
          maxTokens: 200,
          temperature: 0,
        });

        const latencyMs = Date.now() - startMs;
        return result.success
          ? NextResponse.json({ ok: true, latencyMs, response: result.raw?.trim() || 'OK', draft: true })
          : NextResponse.json({
              ok: false,
              latencyMs,
              error: result.errorMessage || 'Provider returned an error',
              response: '',
              draft: true,
            });
      }

      const result = await generateWithAI({
        toolSlug: 'admin-provider-test',
        provider: cleanProvider,
        systemPrompt: 'You are an AI connectivity test assistant.',
        userPrompt: 'Respond with "OK" only.',
        maxTokens: 200,
        temperature: 0,
        disableFallback: true, // Test this specific provider directly
      });

      const latencyMs = Date.now() - startMs;

      if (result.success) {
        return NextResponse.json({
          ok: true,
          latencyMs,
          response: result.raw?.trim() || 'OK',
        });
      } else {
        return NextResponse.json({
          ok: false,
          latencyMs,
          error: result.errorMessage || 'Provider returned an error',
          response: '',
        });
      }
    } catch {
      const latencyMs = Date.now() - startMs;
      return NextResponse.json({
        ok: false,
        latencyMs,
        error: 'provider_test_failed',
        response: '',
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Unauthorized' },
      { status: err.message === 'FORBIDDEN' ? 403 : 401 },
    );
  }
}
