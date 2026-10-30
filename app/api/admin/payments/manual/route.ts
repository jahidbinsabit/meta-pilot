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
    // T4-44: a duplicate TrxID hits the unique index (P2002) — return a
    // 409 the admin can act on instead of a raw 500.
    if (error?.code === 'P2002') {
      return NextResponse.json(
        {
          error: 'duplicate_transaction_ref',
          message: 'A payment with this Transaction ID already exists.',
        },
        { status: 409 },
      );
    }
    // Validation failures from createManualPaymentAdmin are the caller's
    // error (400), not a server fault.
    const CLIENT_ERRORS = [
      'user_not_found',
      'plan_not_found',
      'plan_id_required',
      'package_not_found',
      'nothing_to_fulfill',
    ];
    const status =
      error.message === 'FORBIDDEN'
        ? 403
        : error.message === 'UNAUTHORIZED'
          ? 401
          : CLIENT_ERRORS.includes(error.message)
            ? 400
            : 500;
    return NextResponse.json({ error: error.message || 'internal_error' }, { status });
  }
}
