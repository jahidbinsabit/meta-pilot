import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireApiUser();
  const key = await prisma.apiKey.findFirst({ where: { id: params.id, userId: user.id } });
  if (!key)
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  await prisma.apiKey.update({ where: { id: key.id }, data: { revoked: true } });
  return NextResponse.json({ ok: true });
}
