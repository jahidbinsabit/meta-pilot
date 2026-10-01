import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const patchSchema = z.object({
  siteName: z.string().optional(),
  tagline: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImageUrl: z.string().optional(),
  twitterHandle: z.string().optional(),
  gaMeasurementId: z.string().optional(),
  gscVerification: z.string().optional(),
});

export async function GET() {
  await requireApiAdmin();

  const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    // Create default row
    const created = await prisma.siteSettings.create({
      data: { id: 'default', siteName: 'StockForge AI' },
    });
    return NextResponse.json(created);
  }

  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const admin = await requireApiAdmin();

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error },
      { status: 400 },
    );
  }

  const updated = await prisma.siteSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', siteName: 'StockForge AI', ...parsed.data },
    update: { ...parsed.data, updatedAt: new Date() },
  });

  try {
    revalidateTag('site-settings');
  } catch {
    /* ignore in non-cache contexts */
  }

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'UPDATE',
      targetType: 'SiteSettings',
      targetId: 'default',
      after: parsed.data,
    },
  });

  return NextResponse.json(updated);
}
