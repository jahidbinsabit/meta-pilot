import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { randomString } from '@/lib/utils';

export async function GET() {
  const user = await requireApiUser();
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(keys);
}

export async function POST(req: Request) {
  const user = await requireApiUser();
  const body = await req.json();
  const name = body.name || 'Untitled key';
  const key = `sk_${randomString(32)}`;
  const record = await prisma.apiKey.create({
    data: { userId: user.id, key, name, scopes: ['metadata:generate', 'tools:run'] },
  });
  return NextResponse.json({ key, record });
}
