import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { generateWithAI } from '@/lib/ai/index';

/**
 * POST /api/admin/ai-providers/test
 *
 * Admin-only endpoint to test any AI provider with a simple prompt.
 * Returns latency, response text, and any error messages.
 */
export async function POST(req: Request) {
  try {
    await requireApiAdmin();
    const body = await req.json();
    const { provider } = body;

    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Invalid provider. Provider name is required.' },
        { status: 400 },
      );
    }

    const cleanProvider = provider.trim().toLowerCase();
    const startMs = Date.now();

    try {
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
    } catch (err: any) {
      const latencyMs = Date.now() - startMs;
      return NextResponse.json({
        ok: false,
        latencyMs,
        error: err.message || 'Provider test failed',
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
