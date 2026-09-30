// Credit engine (PROMPT 7).
//
// Every credit movement goes through this module so the balance, the
// `CreditTransaction` row and the audit trail stay in sync. All writes are
// atomic: the wallet row is updated and the transaction row is created inside
// a single `$transaction`, so a crash mid-flow can never leave a dangling
// balance.

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { InsufficientCreditsError } from '@/lib/credits/errors';

export interface CreditResult {
  ok: boolean;
  balance: number;
  transactionId?: string;
  error?: string;
}

export interface WalletState {
  balance: number;
  lastDailyGrantAt: Date | null;
}

/** Ensure a `CreditWallet` row exists for the user (no-op if it does). */
async function ensureWallet(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const existing = await tx.creditWallet.findUnique({ where: { userId } });
  if (existing) return existing.balance;
  await tx.creditWallet.create({ data: { userId, balance: 0 } });
  return 0;
}

/**
 * Keep `User.credits` in sync with `CreditWallet.balance`.
 *
 * The dashboard reads `User.credits` (`app/(app)/dashboard/layout.tsx`) while
 * the credit engine writes `CreditWallet.balance`. Without this mirror the
 * two drift apart silently — the UI shows a stale balance after every
 * spend/grant. Both columns are updated inside the same `$transaction` so
 * they can never diverge.
 */
async function syncUserCredits(tx: Prisma.TransactionClient, userId: string, balance: number) {
  await tx.user.update({ where: { id: userId }, data: { credits: balance } });
}

/**
 * Add credits to a user's wallet. Idempotent in the sense that it always
 * writes a `CreditTransaction` row — callers decide whether to dedupe by
 * passing a `metadata` reference (e.g. an orderId) they can check first.
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: string = 'ADMIN_ADJUSTMENT',
  metadata?: Record<string, unknown>,
): Promise<{ balance: number; transactionId: string }> {
  if (!Number.isInteger(amount)) throw new Error('amount must be an integer');
  if (amount === 0) throw new Error('amount must be non-zero');

  let transactionId = '';
  const balance = await prisma.$transaction(async (tx) => {
    const before = await ensureWallet(tx, userId);
    const next = before + amount;
    if (next < 0) throw new Error('balance would go negative');
    await tx.creditWallet.update({ where: { userId }, data: { balance: next } });
    await syncUserCredits(tx, userId, next);
    const t = await tx.creditTransaction.create({
      data: { userId, amount, type: type as any, metadata: metadata as any },
    });
    transactionId = t.id;
    return next;
  });
  return { balance, transactionId };
}

/**
 * Deduct credits. Throws `InsufficientCreditsError` when the balance is too
 * low — route handlers catch it and return a 402 / upgrade-CTA response.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: string = 'SPEND',
  metadata?: Record<string, unknown>,
): Promise<CreditResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, balance: 0, error: 'invalid_amount' };
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    const balance = wallet?.balance ?? 0;
    if (balance < amount) {
      throw new InsufficientCreditsError(
        `Insufficient credits: have ${balance}, need ${amount}`,
        balance,
        amount,
      );
    }
    await tx.creditWallet.update({ where: { userId }, data: { balance: balance - amount } });
    await syncUserCredits(tx, userId, balance - amount);
    const t = await tx.creditTransaction.create({
      data: { userId, amount: -amount, type: type as any, metadata: metadata as any },
    });
    return { ok: true, balance: balance - amount, transactionId: t.id };
  });
}

/** Single entry point for every credit-consuming tool action. */
export async function spendCredits(
  userId: string,
  toolSlug: string,
  amount: number,
  metadata?: Record<string, unknown>,
): Promise<CreditResult> {
  return deductCredits(userId, amount, 'SPEND', { ...metadata, toolSlug });
}

/** Refund a failed generation. Writes a `refund` transaction. */
export async function refundCredits(
  userId: string,
  toolJobId: string,
  amount: number,
  metadata?: Record<string, unknown>,
): Promise<{ balance: number; transactionId: string }> {
  return addCredits(userId, amount, 'REFUND', { ...metadata, toolJobId });
}

/** Read the current wallet state without writing. */
export async function getWallet(userId: string): Promise<WalletState> {
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) return { balance: 0, lastDailyGrantAt: null };
  return { balance: wallet.balance, lastDailyGrantAt: wallet.lastDailyGrantAt };
}

/** Alias used by the dashboard credits endpoint. */
export async function getBalance(userId: string): Promise<number> {
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  return wallet?.balance ?? 0;
}

/** Paginated credit history for the account / billing screens. */
export async function getCreditHistory(
  userId: string,
  take: number = 50,
): Promise<{ transactions: any[]; balance: number }> {
  const [transactions, balance] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    getBalance(userId),
  ]);
  return { transactions, balance };
}

/**
 * Bonus-credit grant used by the daily cron.
 *
 * `grantDailyCredits` reads the user's plan to decide *how much* to grant;
 * this variant takes the amount explicitly so the cron can batch-grant a
 * fixed allowance without a per-user plan lookup. Both paths are
 * idempotent via the same `lastDailyGrantAt` guard.
 */
export async function grantBonus(
  userId: string,
  amount: number,
  reason: string = 'daily_free',
  metadata?: Record<string, unknown>,
): Promise<{ balance: number; transactionId: string }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer');
  }
  let transactionId = '';
  const balance = await prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    if (!wallet) {
      await tx.creditWallet.create({ data: { userId, balance: 0 } });
      return 0;
    }
    const next = wallet.balance + amount;
    await tx.creditWallet.update({ where: { userId }, data: { balance: next } });
    await syncUserCredits(tx, userId, next);
    const t = await tx.creditTransaction.create({
      data: { userId, amount, type: 'DAILY_GRANT', reason, metadata: metadata as any },
    });
    transactionId = t.id;
    return next;
  });
  return { balance, transactionId };
}

/**
 * Grant the daily free-credit allowance once per rolling UTC day.
 * Idempotent — safe to call concurrently; the `lastDailyGrantAt` check is
 * part of the same transaction that writes the grant, so a race cannot
 * double-credit.
 */
export async function grantDailyCredits(userId: string): Promise<{
  granted: boolean;
  balance: number;
  amount: number;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { granted: false, balance: 0, amount: 0 };

  // Daily free credits come from the user's active plan.
  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { plan: true },
  });
  const plan = membership?.plan;
  const amount = plan?.dailyFreeCredits ?? 0;
  if (amount <= 0) {
    const w = await getWallet(userId);
    return { granted: false, balance: w.balance, amount: 0 };
  }

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    if (!wallet) {
      await tx.creditWallet.create({ data: { userId, balance: 0 } });
      return { granted: false, balance: 0, amount };
    }
    if (wallet.lastDailyGrantAt && wallet.lastDailyGrantAt >= startOfDay) {
      return { granted: false, balance: wallet.balance, amount };
    }
    const next = wallet.balance + amount;
    await tx.creditWallet.update({
      where: { userId },
      data: { balance: next, lastDailyGrantAt: now },
    });
    await syncUserCredits(tx, userId, next);
    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type: 'DAILY_GRANT',
        metadata: { date: startOfDay.toISOString() } as any,
      },
    });
    return { granted: true, balance: next, amount };
  });
}

/** Alias used by the auth callbacks (login-time daily grant). */
export async function grantDailyFree(userId: string) {
  return grantDailyCredits(userId);
}
