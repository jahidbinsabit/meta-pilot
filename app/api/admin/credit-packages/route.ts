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

  // T4-36: duplicate package name hit the @unique constraint as an
  // unhandled 500 — map P2002 to a 409 the client can explain.
  let pkg;
  try {
    pkg = await prisma.creditPackage.create({
      data: parsed.data,
    });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: 'package_exists', message: `A credit package named "${parsed.data.name}" already exists.` },
        { status: 409 },
      );
    }
    throw e;
  }

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
