import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { createManualPaymentAdmin } from '@/lib/payments/config';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin();
    const body = await req.json();
    const {
      userId,
      type,
      planId,
      packageId,
      credits,
      amountBDT,
      amountUSD,
      method,
      transactionRef,
      senderNumber,
      notes,
      autoApprove = true,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'user_id_required' }, { status: 400 });
    }

    if (!type || (type !== 'plan' && type !== 'credits')) {
      return NextResponse.json({ error: 'valid_type_required' }, { status: 400 });
    }

    const payment = await createManualPaymentAdmin(
      {
        userId,
        type,
        planId,
        packageId,
        credits: credits ? Number(credits) : undefined,
        amountBDT: amountBDT ? Number(amountBDT) : 0,
        amountUSD: amountUSD ? Number(amountUSD) : 0,
        method: method || 'BKASH_MANUAL',
        transactionRef,
        senderNumber,
        notes,
        autoApprove: Boolean(autoApprove),
      },
      admin.id,
    );

    return NextResponse.json({ ok: true, payment });
  } catch (error: any) {
    console.error('Admin create manual payment error:', error);
    const status = error.message === 'FORBIDDEN' ? 403 : error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: error.message || 'internal_error' }, { status });
  }
}
