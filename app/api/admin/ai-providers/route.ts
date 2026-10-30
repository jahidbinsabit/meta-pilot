import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { writeAudit } from '@/lib/audit';

/**
 * GET: list all provider configs (admin only).
 */
export async function GET() {
  await requireApiAdmin();
  const configs = await prisma.aiProviderConfig.findMany({
    orderBy: [{ priority: 'desc' }, { provider: 'asc' }],
  });
  const safe = configs.map((c) => ({
    ...c,
    // Never expose raw or encrypted key material to the browser.
    apiKey: '',
    hasKey: !!c.apiKey ||
      (c.provider === 'gemini' && !!process.env.GEMINI_API_KEY) ||
      (c.provider === 'openai' && !!process.env.OPENAI_API_KEY),
  }));
  return NextResponse.json(safe);
}

/**
 * POST: upsert one provider config.
 */
export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  const body = await req.json();
  const {
    provider,
    enabled,
    apiKey,
    modelDefault,
    customApiUrl,
    customHeaders,
    apiType,
    costPer1kIn,
    costPer1kOut,
    maxTokens,
    priority,
    isActiveForToolSlug,
  } = body;

  if (!provider || typeof provider !== 'string') {
    return NextResponse.json({ error: 'Provider name is required' }, { status: 400 });
  }

  const cleanProvider = provider.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const before = await prisma.aiProviderConfig.findUnique({ where: { provider: cleanProvider } });

  // Handle apiKey:
  // If user entered a new key, encrypt and save it.
  // If user left it blank / "configured" / bullet placeholder, retain existing encrypted key.
  let resolvedApiKey: string | undefined = undefined;
  if (apiKey !== undefined && apiKey !== null) {
    const rawKey = String(apiKey).trim();
    if (rawKey && rawKey !== 'configured' && !rawKey.startsWith('••••')) {
      resolvedApiKey = encryptSecret(rawKey);
    } else if (rawKey === '' && !before?.apiKey) {
      resolvedApiKey = '';
    }
  }

  const cfg = await prisma.aiProviderConfig.upsert({
    where: { provider: cleanProvider },
    update: {
      enabled: enabled !== undefined ? !!enabled : undefined,
      ...(resolvedApiKey !== undefined ? { apiKey: resolvedApiKey } : {}),
      modelDefault: modelDefault !== undefined ? String(modelDefault).trim() : undefined,
      customApiUrl: customApiUrl !== undefined ? String(customApiUrl).trim() : undefined,
      customHeaders: customHeaders !== undefined ? customHeaders : undefined,
      apiType: apiType !== undefined ? String(apiType).trim() : undefined,
      costPer1kIn: costPer1kIn !== undefined ? Number(costPer1kIn) : undefined,
      costPer1kOut: costPer1kOut !== undefined ? Number(costPer1kOut) : undefined,
      maxTokens: maxTokens !== undefined ? Number(maxTokens) : undefined,
      priority: priority !== undefined ? Number(priority) : undefined,
      isActiveForToolSlug: isActiveForToolSlug !== undefined ? isActiveForToolSlug : undefined,
      updatedAt: new Date(),
      updatedBy: admin.id,
    },
    create: {
      provider: cleanProvider,
      enabled: enabled !== undefined ? !!enabled : true,
      apiKey:
        resolvedApiKey ||
        (cleanProvider === 'gemini' && process.env.GEMINI_API_KEY
          ? encryptSecret(process.env.GEMINI_API_KEY)
          : cleanProvider === 'openai' && process.env.OPENAI_API_KEY
            ? encryptSecret(process.env.OPENAI_API_KEY)
            : undefined),
      modelDefault: modelDefault?.trim() || (cleanProvider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o'),
      customApiUrl: customApiUrl?.trim() || undefined,
      customHeaders: customHeaders ?? undefined,
      apiType: apiType || 'openai',
      costPer1kIn: Number(costPer1kIn || 0),
      costPer1kOut: Number(costPer1kOut || 0),
      maxTokens: Number(maxTokens || 2048),
      priority: Number(priority || 0),
      isActiveForToolSlug: isActiveForToolSlug ?? undefined,
      updatedBy: admin.id,
    },
  });

  // Audit-trail entry
  try {
    await writeAudit({
      adminId: admin.id,
      action: before ? 'ai_provider_config_updated' : 'ai_provider_config_created',
      targetType: 'AiProviderConfig',
      targetId: cfg.id,
      before: before || undefined,
      after: cfg,
    });
  } catch (e) {
    console.error('[audit] ai provider config audit write failed', e);
  }

  return NextResponse.json({
    ...cfg,
    // Never return raw/encrypted key material to the client.
    apiKey: '',
    hasKey: !!cfg.apiKey ||
      (cleanProvider === 'gemini' && !!process.env.GEMINI_API_KEY) ||
      (cleanProvider === 'openai' && !!process.env.OPENAI_API_KEY),
  });
}

/**
 * PATCH: update one provider config.
 */
export async function PATCH(req: Request) {
  return POST(req);
}

/**
 * DELETE: remove a custom provider config.
 */
export async function DELETE(req: Request) {
  const admin = await requireApiAdmin();
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');

  if (!provider) {
    return NextResponse.json({ error: 'Provider name is required' }, { status: 400 });
  }

  const cleanProvider = provider.trim().toLowerCase();
  if (cleanProvider === 'gemini' || cleanProvider === 'openai') {
    return NextResponse.json(
      { error: 'Default providers (gemini, openai) cannot be deleted' },
      { status: 400 },
    );
  }

  const before = await prisma.aiProviderConfig.findUnique({ where: { provider: cleanProvider } });
  if (!before) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }

  await prisma.aiProviderConfig.delete({ where: { provider: cleanProvider } });

  try {
    await writeAudit({
      adminId: admin.id,
      action: 'ai_provider_config_deleted',
      targetType: 'AiProviderConfig',
      targetId: before.id,
      before,
    });
  } catch (e) {
    console.error('[audit] ai provider config audit write failed', e);
  }

  return NextResponse.json({ ok: true, deleted: cleanProvider });
}
