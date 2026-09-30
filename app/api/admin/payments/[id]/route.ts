import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { fulfillPayment, rejectPayment } from '@/lib/payments/fulfill';

export const runtime = 'nodejs';

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const admin = await requireApiAdmin(req);
    const params = await Promise.resolve(props.params);
    const { id } = params;

    const body = await req.json();
    const { action, reason } = body;

    if (action === 'approve') {
      const result = await fulfillPayment(id);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, already: result.already });
    }

    if (action === 'reject') {
      const result = await rejectPayment(id, admin.id, reason);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (error: any) {
    if (error?.message === 'Unauthorized' || error?.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Admin payment action error:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

