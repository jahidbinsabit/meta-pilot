import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { getUserAiKeysStatus, isUserApiKeyRequired } from '@/lib/ai/user-keys';
import { z } from 'zod';

export const runtime = 'nodejs';

const updateKeysSchema = z.object({
  geminiApiKey: z.string().optional().nullable(),
  grokApiKey: z.string().optional().nullable(),
  openaiApiKey: z.string().optional().nullable(),
  preferredAiProvider: z.enum(['auto', 'gemini', 'grok', 'openai']).optional(),
});

/**
 * GET: retrieve current status of user AI keys and admin requirements
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(req);
    const status = await getUserAiKeysStatus(user.id);
    return NextResponse.json(status);
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e.message || 'failed_to_fetch_keys' }, { status: 500 });
  }
}

/**
 * POST / PATCH: save or update user AI keys
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const parsed = updateKeysSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_failed', details: parsed.error },
        { status: 400 },
      );
    }

    const { geminiApiKey, grokApiKey, openaiApiKey, preferredAiProvider } = parsed.data;
    const updateData: Record<string, any> = {};

    // Handle Gemini key: if non-empty, encrypt. If explicitly empty/null, clear.
    if (geminiApiKey !== undefined) {
      if (geminiApiKey && geminiApiKey.trim()) {
        const raw = geminiApiKey.trim();
        // If placeholder like '••••••••' or 'configured', leave unchanged
        if (!raw.startsWith('••••') && raw !== 'configured') {
          updateData.geminiApiKey = encryptSecret(raw);
        }
      } else {
        updateData.geminiApiKey = null;
      }
    }

    // Handle Grok key
    if (grokApiKey !== undefined) {
      if (grokApiKey && grokApiKey.trim()) {
        const raw = grokApiKey.trim();
        if (!raw.startsWith('••••') && raw !== 'configured') {
          updateData.grokApiKey = encryptSecret(raw);
        }
      } else {
        updateData.grokApiKey = null;
      }
    }

    // Handle OpenAI key
    if (openaiApiKey !== undefined) {
      if (openaiApiKey && openaiApiKey.trim()) {
        const raw = openaiApiKey.trim();
        if (!raw.startsWith('••••') && raw !== 'configured') {
          updateData.openaiApiKey = encryptSecret(raw);
        }
      } else {
        updateData.openaiApiKey = null;
      }
    }

    if (preferredAiProvider !== undefined) {
      updateData.preferredAiProvider = preferredAiProvider;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    const updatedStatus = await getUserAiKeysStatus(user.id);
    return NextResponse.json({
      success: true,
      message: 'API keys updated successfully',
      ...updatedStatus,
    });
  } catch (e: any) {
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: e.message || 'failed_to_save_keys' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  return POST(req);
}
