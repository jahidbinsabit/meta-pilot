import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { ensureDatabaseSchema } from '@/lib/db-sync';

const patchSchema = z.object({
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
  siteIconUrl: z.string().optional(),
  tagline: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImageUrl: z.string().optional(),
  twitterHandle: z.string().optional(),
  gaMeasurementId: z.string().optional(),
  gscVerification: z.string().optional(),
  userApiKeyRequired: z.boolean().optional(),
  signupCredits: z.number().int().min(0).max(100000).optional(),
  unlimitedMode: z.boolean().optional(),
  apifyApiToken: z.string().nullable().optional(),
  apifyActorId: z.string().nullable().optional(),
});

/**
 * M4: the Apify token is a paid credential — never return it in full from
 * the admin settings API. Responses carry only a masked preview (same
 * `••••last4` style as lib/payments/config maskCredentials) plus a boolean
 * so the UI can tell "set" from "not set".
 */
const MASK_PREFIX = '••••';

function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? MASK_PREFIX : `${MASK_PREFIX}${value.slice(-4)}`;
}

function publicSettings<T extends { apifyApiToken?: string | null }>(settings: T) {
  return {
    ...settings,
    apifyApiToken: maskSecret(settings.apifyApiToken),
    apifyTokenSet: Boolean(settings.apifyApiToken),
  };
}

const SECRET_FIELD = /token|secret|password|passwd|api[-_]?key|credential/i;

/**
 * M4: audit snapshots must never become a second store for secrets — the
 * settings PATCH previously copied `apifyApiToken` into AuditLog.after in
 * plaintext. Redact any secret-looking field before writing the snapshot.
 */
function redactSecrets(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = SECRET_FIELD.test(key) && value !== null && value !== '' ? '[REDACTED]' : value;
  }
  return out;
}

export async function PATCH(req: Request) {
  const admin = await requireApiAdmin();
  await ensureDatabaseSchema().catch(() => {});

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error },
      { status: 400 },
    );
  }

  const data: Record<string, any> = { ...parsed.data };

  // M4: the settings form round-trips whatever GET returned — which is now
  // the masked preview. A masked (or empty) token field means "unchanged":
  // drop it from the update so the stored token survives the save. Only a
  // fresh plaintext value (or explicit null) replaces/clears it.
  if (
    typeof data.apifyApiToken === 'string' &&
    (data.apifyApiToken === '' || data.apifyApiToken.startsWith(MASK_PREFIX))
  ) {
    delete data.apifyApiToken;
  }

  const updated = await prisma.siteSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', siteName: 'MetaCSV', ...data },
    update: { ...data, updatedAt: new Date() },
  });

  try {
    revalidateTag('site-settings');
  } catch {
    /* ignore in non-cache contexts */
  }

  try {
    revalidatePath('/', 'layout');
  } catch {
    /* ignore */
  }

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'UPDATE',
      targetType: 'SiteSettings',
      targetId: 'default',
      after: redactSecrets(data),
    },
  });

  return NextResponse.json(publicSettings(updated));
}
