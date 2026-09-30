import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiAdmin } from '@/lib/api/auth';

export const runtime = 'nodejs';

function normalizeAudience(value: unknown) {
  const normalized = String(value || 'ALL').toUpperCase();
  if (['ALL', 'FREE', 'PRO', 'PLUS', 'AGENCY'].includes(normalized)) {
    return normalized as 'ALL' | 'FREE' | 'PRO' | 'PLUS' | 'AGENCY';
  }
  return 'ALL';
}

export async function GET() {
  try {
    await requireApiAdmin();
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(notifications);
  } catch (error: any) {
    if (error?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (error?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin(req);
    const body = await req.json();

    const title = String(body?.title ?? '').trim();
    const bodyText = String(body?.body ?? '').trim();
    if (!title || !bodyText) {
      return NextResponse.json({ error: 'title_and_body_required' }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        title,
        body: bodyText,
        ctaLabel: body?.ctaLabel ? String(body.ctaLabel).trim() || null : null,
        ctaUrl: body?.ctaUrl ? String(body.ctaUrl).trim() || null : null,
        audience: normalizeAudience(body?.audience),
        startsAt: body?.startsAt ? new Date(body.startsAt) : null,
        endsAt: body?.endsAt ? new Date(body.endsAt) : null,
        isActive: body?.isActive !== undefined ? Boolean(body.isActive) : true,
        createdById: admin.id,
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error: any) {
    if (error?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (error?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: error?.message || 'create_failed' }, { status: 500 });
  }
}
