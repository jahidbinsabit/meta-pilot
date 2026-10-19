import { NextResponse } from 'next/server';
import { deductCredits, getBalance, type CreditResult } from './engine';
import { isInsufficientCreditsError } from './errors';

/**
 * Shared credit-gating for generate/tool routes.
 *
 * Deducts `amount` credits and returns the deduction result, or a 402
 * NextResponse when the user can't afford it. Throws a NextResponse for
 * the 402 case would be nicer, but returning a discriminated union keeps
 * call sites explicit:
 *
 *   const charged = await chargeCredits(user.id, cost, 'SPEND', meta);
 *   if (charged instanceof NextResponse) return charged;
 *   // charged.deduction is a CreditResult here
 *
 * Non-credit errors from the engine are re-thrown for the route's own
 * catch block to handle.
 */
export async function chargeCredits(
  userId: string,
  amount: number,
  type: string = 'SPEND',
  metadata?: Record<string, unknown>,
): Promise<CreditResult | NextResponse> {
  // M1: zero/negative cost (admin set the tool free via ToolCreditCost) —
  // deductCredits rejects amount <= 0 with 402, which would make a free
  // tool unusable. Short-circuit: nothing to deduct.
  if (amount <= 0) {
    return { ok: true, deducted: false, balance: await getBalance(userId) };
  }
  let deduction: CreditResult;
  try {
    deduction = await deductCredits(userId, amount, type, metadata);
  } catch (e) {
    if (isInsufficientCreditsError(e)) {
      return NextResponse.json(
        { error: 'insufficient_credits', balance: (e as any).balance, needed: (e as any).needed },
        { status: 402 },
      );
    }
    throw e;
  }
  if (!deduction.ok) {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }
  return deduction;
}
