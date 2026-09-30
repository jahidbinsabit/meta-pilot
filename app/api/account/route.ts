import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { refreshSessionJWT } from '@/lib/auth-handler';

/** Update display name / avatar. */
export async function PATCH(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() || null : undefined;
    const image = typeof body.image === 'string' ? body.image || null : undefined;
    const data: Prisma.UserUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (image !== undefined) data.image = image;
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await refreshSessionJWT(req);
    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      image: updated.image,
      role: updated.role,
      membership: updated.membership,
      credits: updated.credits,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'update_failed' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

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
    return new Response(JSON.stringify({ error: e.message || 'delete_failed' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
