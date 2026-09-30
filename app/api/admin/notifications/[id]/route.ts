import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiAdmin } from '@/lib/api/auth';

export const runtime = 'nodejs';

function normalizeAudience(value: unknown) {
  const normalized = typeof value === 'string' ? value.toUpperCase() : 'ALL';
  if (['ALL', 'FREE', 'PRO', 'PLUS', 'AGENCY'].includes(normalized)) {
    return normalized as 'ALL' | 'FREE' | 'PRO' | 'PLUS' | 'AGENCY';
  }
  return 'ALL';
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiAdmin(req);
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body?.title !== 'undefined') {
      const title = String(body.title || '').trim();
      if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 });
      data.title = title;
    }

    if (typeof body?.body !== 'undefined') {
      const bodyText = String(body.body || '').trim();
      if (!bodyText) return NextResponse.json({ error: 'body_required' }, { status: 400 });
      data.body = bodyText;
    }

    if (typeof body?.ctaLabel !== 'undefined')
      data.ctaLabel = body.ctaLabel ? String(body.ctaLabel).trim() || null : null;
    if (typeof body?.ctaUrl !== 'undefined')
      data.ctaUrl = body.ctaUrl ? String(body.ctaUrl).trim() || null : null;
    if (typeof body?.audience !== 'undefined') data.audience = normalizeAudience(body.audience);
    if (typeof body?.startsAt !== 'undefined')
      data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (typeof body?.endsAt !== 'undefined')
      data.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (typeof body?.isActive !== 'undefined') data.isActive = Boolean(body.isActive);

    const notification = await prisma.notification.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(notification);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const message = error?.message || 'update_failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiAdmin(_req);
    await prisma.notification.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const message = error?.message || 'delete_failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500 },
    );
  }
}
