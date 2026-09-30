import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  credits: z.number().int().min(1).optional(),
  priceUSD: z.number().min(0).optional(),
  priceBDT: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireApiAdmin();
  const { id } = params;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error },
      { status: 400 },
    );
  }

  const before = await prisma.creditPackage.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: 'package_not_found' }, { status: 404 });
  }

  const pkg = await prisma.creditPackage.update({
    where: { id },
    data: { ...parsed.data, updatedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'UPDATE',
      targetType: 'CreditPackage',
      targetId: pkg.id,
      before,
      after: pkg,
    },
  });

  return NextResponse.json(pkg);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireApiAdmin();
  const { id } = params;

  const pkg = await prisma.creditPackage.findUnique({ where: { id } });
  if (!pkg) {
    return NextResponse.json({ error: 'package_not_found' }, { status: 404 });
  }

  await prisma.creditPackage.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'DELETE',
      targetType: 'CreditPackage',
      targetId: id,
      before: pkg,
    },
  });

  return NextResponse.json({ success: true });
}
