import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({
  contentJson: z.record(z.any()),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export async function GET(req: Request, { params }: { params: { sectionKey: string } }) {
  await requireApiAdmin();
  const { sectionKey } = params;

  const row = await prisma.homepageContent.upsert({
    where: { sectionKey },
    create: { sectionKey, contentJson: {}, isActive: true, sortOrder: 0 },
    update: {},
  });

  return NextResponse.json(row);
}

export async function PUT(req: Request, { params }: { params: { sectionKey: string } }) {
  const admin = await requireApiAdmin();
  const { sectionKey } = params;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error },
      { status: 400 },
    );
  }

  const { contentJson, isActive, sortOrder } = parsed.data;

  const updated = await prisma.homepageContent.upsert({
    where: { sectionKey },
    create: {
      sectionKey,
      contentJson,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
    },
    update: {
      contentJson,
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
      updatedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'UPDATE',
      targetType: 'HomepageContent',
      targetId: sectionKey,
      after: contentJson,
    },
  });

  return NextResponse.json(updated);
}
