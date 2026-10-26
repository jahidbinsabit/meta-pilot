import { NextResponse } from 'next/server';
import { requireApiUser, hashApiKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { randomString } from '@/lib/utils';
import { rateLimitResponse } from '@/lib/rate-limit';

/**
 * Mask an sk_ secret for list display — the full secret is only ever shown
 * once, at creation time (POST). Never expose it again.
 */
function maskKey(key: string): string {
  if (key.length <= 8) return 'sk_...';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export async function GET() {
  const user = await requireApiUser();
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      key: true,
      keyPrefix: true,
      name: true,
      scopes: true,
      revoked: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json(
    keys.map((k) => ({
      id: k.id,
      // New keys have no plaintext: show the mask captured at creation.
      // Legacy rows (not yet migrated by db-sync) mask from plaintext.
      keyPreview: k.key ? maskKey(k.key) : k.keyPrefix || 'sk_...',
      name: k.name,
      scopes: k.scopes,
      revoked: k.revoked,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    })),
  );
}

export async function POST(req: Request) {
  // Rate-limit key creation — prevents mass key minting.
  const limited = rateLimitResponse(req, { max: 10, windowMs: 60_000, scope: 'keys-create' });
  if (limited) return limited;

  const user = await requireApiUser();
  const body = await req.json().catch(() => ({}));
  const name = body.name || 'Untitled key';

  // Optional expiry (M6 hardening): accept expiresInDays (number) or an
  // expiresAt ISO date string. Default: no expiry.
  let expiresAt: Date | null = null;
  if (typeof body.expiresInDays === 'number' && body.expiresInDays > 0) {
    expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
  } else if (typeof body.expiresAt === 'string') {
    const parsed = new Date(body.expiresAt);
    if (!Number.isNaN(parsed.getTime())) expiresAt = parsed;
  }

  const key = `sk_${randomString(32)}`;
  // M6 hardening: store ONLY the SHA-256 hash + a display mask. The
  // plaintext is returned exactly once, in this creation response.
  const record = await prisma.apiKey.create({
    data: {
      userId: user.id,
      key: null,
      keyHash: hashApiKey(key),
      keyPrefix: maskKey(key),
      name,
      scopes: ['metadata:generate', 'tools:run'],
      expiresAt,
    },
  });
  // Never echo the stored row's secret material back (record.key is null
  // and keyHash is not a usable credential, but keep the response shape
  // explicit): return the one-time plaintext separately as before.
  const { keyHash: _omit, ...safeRecord } = record;
  return NextResponse.json({ key, record: safeRecord });
}
