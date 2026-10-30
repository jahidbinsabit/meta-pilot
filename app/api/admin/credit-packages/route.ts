import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1),
  credits: z.number().int().min(1),
  priceUSD: z.number().min(0),
  priceBDT: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  await requireApiAdmin();

  const packages = await prisma.creditPackage.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return NextResponse.json(packages);
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error },
      { status: 400 },
    );
  }

  const pkg = await prisma.creditPackage.create({
    data: parsed.data,
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'CREATE',
      targetType: 'CreditPackage',
      targetId: pkg.id,
      after: parsed.data,
    },
  });

  return NextResponse.json(pkg, { status: 201 });
}
