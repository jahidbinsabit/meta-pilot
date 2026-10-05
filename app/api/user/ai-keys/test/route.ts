import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { GeminiAdapter } from '@/lib/ai/gemini';
import { GrokAdapter } from '@/lib/ai/grok';
import { OpenAiAdapter } from '@/lib/ai/openai';
import { getUserAiKeysDecrypted } from '@/lib/ai/user-keys';
import { z } from 'zod';

export const runtime = 'nodejs';

const testSchema = z.object({
  provider: z.enum(['gemini', 'grok', 'openai']),
  apiKey: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const parsed = testSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_params', details: parsed.error }, { status: 400 });
    }

    const { provider, apiKey: rawInputKey } = parsed.data;
    let keyToTest = rawInputKey?.trim();

    // If no key sent in request body or placeholder, use the user's stored key
    if (!keyToTest || keyToTest.startsWith('••••') || keyToTest === 'configured') {
      const userKeys = await getUserAiKeysDecrypted(user.id);
      if (provider === 'gemini') keyToTest = userKeys.geminiKey;
      else if (provider === 'grok') keyToTest = userKeys.grokKey;
      else if (provider === 'openai') keyToTest = userKeys.openaiKey;
    }

    if (!keyToTest) {
      return NextResponse.json(
        { ok: false, error: 'No API key provided to test.' },
        { status: 400 },
      );
    }

    const start = Date.now();
    let adapter: any;
    if (provider === 'gemini') {
      adapter = new GeminiAdapter(keyToTest, 'gemini-3.8-flash');
    } else if (provider === 'grok') {
      adapter = new GrokAdapter(keyToTest, 'grok-2-latest');
    } else {
      adapter = new OpenAiAdapter(keyToTest, 'gpt-4o');
    }

    const result = await adapter.generate({
      toolSlug: 'test',
      systemPrompt: 'You are an AI connectivity test assistant.',
      userPrompt: 'Test connection. Reply with "OK".',
      maxTokens: 500,
      temperature: 0.1,
    });

    const latencyMs = Date.now() - start;

    if (!result.success && result.errorMessage) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        error: result.errorMessage,
      });
    }

    return NextResponse.json({
      ok: true,
      latencyMs,
      response: result.raw.trim() || 'Connected successfully',
    });
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: e.message || 'Connection test failed' },
      { status: 200 },
    );
  }
}
