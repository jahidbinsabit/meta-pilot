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
import { getSiteSettings } from '@/lib/site-settings';

export interface CreditResult {
  ok: boolean;
  balance: number;
  transactionId?: string;
  error?: string;
  /** True only when credits were actually deducted. False in unlimited mode. */
  deducted?: boolean;
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
 *
 * When admin enables "Unlimited mode" in Site settings, deduction is skipped
 * entirely (no balance change, no transaction row) and the call succeeds.
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

  // Unlimited mode: admin toggle — everyone generates free, no deduction.
  try {
    const settings = await getSiteSettings();
    if (settings?.unlimitedMode === true) {
      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      return { ok: true, balance: wallet?.balance ?? 0, deducted: false };
    }
  } catch {
    // If settings can't be read, fall through to normal deduction.
  }

  return prisma.$transaction(async (tx) => {
    // Atomic conditional decrement: prevents double-spend race where two
    // concurrent requests both read the same balance and both succeed.
    const updated = await tx.creditWallet.updateMany({
      where: { userId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (updated.count === 0) {
      const wallet = await tx.creditWallet.findUnique({ where: { userId } });
      const balance = wallet?.balance ?? 0;
      throw new InsufficientCreditsError(
        `Insufficient credits: have ${balance}, need ${amount}`,
        balance,
        amount,
      );
    }
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    const newBalance = wallet?.balance ?? 0;
    await syncUserCredits(tx, userId, newBalance);
    const t = await tx.creditTransaction.create({
      data: { userId, amount: -amount, type: type as any, metadata: metadata as any },
    });
    return { ok: true, balance: newBalance, transactionId: t.id, deducted: true };
  });
}

/** Single entry point for every credit-consuming tool action. */
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
): Promise<{ balance: number; transactionId: string; granted: boolean }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer');
  }
  let transactionId = '';
  let granted = true;
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const balance = await prisma.$transaction(async (tx) => {
    // Ensure the wallet exists (create AND grant — never silently drop).
    await tx.creditWallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });
    // Idempotency via ATOMIC CLAIM: the conditional update takes the row's
    // write lock, so at READ COMMITTED the second concurrent transaction
    // re-evaluates the WHERE against the first's committed row and gets
    // count === 0. A plain read-then-write inside the transaction does NOT
    // serialize — that was the double-grant race.
    const claimWhere: any = { userId };
    if (reason === 'daily_free') {
      claimWhere.OR = [{ lastDailyGrantAt: null }, { lastDailyGrantAt: { lt: startOfDay } }];
    }
    const claimed = await tx.creditWallet.updateMany({
      where: claimWhere,
      data: reason === 'daily_free'
        ? { balance: { increment: amount }, lastDailyGrantAt: now }
        : { balance: { increment: amount } },
    });
    if (claimed.count === 0) {
      granted = false;
      const w = await tx.creditWallet.findUnique({ where: { userId } });
      return w?.balance ?? 0;
    }
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    const next = wallet?.balance ?? 0;
    await syncUserCredits(tx, userId, next);
    const t = await tx.creditTransaction.create({
      data: { userId, amount, type: 'DAILY_GRANT', reason, metadata: metadata as any },
    });
    transactionId = t.id;
    return next;
  });
  return { balance, transactionId, granted };
}

/**
 * Grant the daily free-credit allowance once per rolling UTC day.
 * Idempotent — safe to call concurrently. The grant is claimed with an
 * ATOMIC conditional update (row write-lock), so a second concurrent call
 * sees the first's committed `lastDailyGrantAt` and skips. A plain
 * read-then-write inside the transaction does NOT serialize at READ
 * COMMITTED — that was the double-grant race.
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
    // Ensure the wallet exists (create AND grant — never silently drop it).
    await tx.creditWallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });
    // Atomic claim: only one concurrent transaction wins the grant.
    const claimed = await tx.creditWallet.updateMany({
      where: {
        userId,
        OR: [{ lastDailyGrantAt: null }, { lastDailyGrantAt: { lt: startOfDay } }],
      },
      data: { balance: { increment: amount }, lastDailyGrantAt: now },
    });
    if (claimed.count === 0) {
      const w = await tx.creditWallet.findUnique({ where: { userId } });
      return { granted: false, balance: w?.balance ?? 0, amount };
    }
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    const next = wallet?.balance ?? 0;
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
