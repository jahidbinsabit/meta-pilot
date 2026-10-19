import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
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
      name: true,
      scopes: true,
      revoked: true,
      createdAt: true,
    },
  });
  return NextResponse.json(
    keys.map((k) => ({
      id: k.id,
      keyPreview: maskKey(k.key),
      name: k.name,
      scopes: k.scopes,
      revoked: k.revoked,
      createdAt: k.createdAt,
    })),
  );
}

export async function POST(req: Request) {
  // Rate-limit key creation — prevents mass key minting.
  const limited = rateLimitResponse(req, { max: 10, windowMs: 60_000, scope: 'keys-create' });
  if (limited) return limited;

  const user = await requireApiUser();
  const body = await req.json();
  const name = body.name || 'Untitled key';
  const key = `sk_${randomString(32)}`;
  const record = await prisma.apiKey.create({
    data: { userId: user.id, key, name, scopes: ['metadata:generate', 'tools:run'] },
  });
  return NextResponse.json({ key, record });
}
