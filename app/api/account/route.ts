import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';

/** Soft-delete account: mark deletedAt + schedule purge in 30 days. */
export async function DELETE(req: Request) {
  try {
    const user = await requireApiUser(req);
    const deletedAt = new Date();
    const purgeAt = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt, deletedPurgeAt: purgeAt } as any,
    });
    return NextResponse.json({
      ok: true,
      deletedAt: deletedAt.toISOString(),
      purgeAt: purgeAt.toISOString(),
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'delete_failed' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
