import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/** Shape every audit entry shares. */
export interface AuditEntry {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Write an `AuditLog` row. Fire-and-forget from a `$transaction` — the entry
 * is part of the same transaction as the mutation it describes, so a rollback
 * rolls the audit entry back too.
 *
 * `before`/`after` are deep-cloned JSON-safe snapshots so the diff in the
 * admin UI is meaningful even if the row is later mutated.
 */
export async function writeAudit(entry: AuditEntry): Promise<string> {
  const row = await prisma.auditLog.create({
    data: {
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before:
        entry.before === undefined ? undefined : (JSON.parse(JSON.stringify(entry.before)) as any),
      after:
        entry.after === undefined ? undefined : (JSON.parse(JSON.stringify(entry.after)) as any),
    },
  });
  return row.id;
}

/**
 * Run a mutation and an audit write atomically. Use this for every admin
 * mutation in PROMPT 9 so the audit trail can never diverge from the data.
 */
export async function withAudit<T>(
  entry: Omit<AuditEntry, 'targetId'> & { targetId: string },
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await mutate(tx);
    await tx.auditLog.create({
      data: {
        adminId: entry.adminId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        before:
          entry.before === undefined
            ? undefined
            : (JSON.parse(JSON.stringify(entry.before)) as any),
        after:
          entry.after === undefined ? undefined : (JSON.parse(JSON.stringify(entry.after)) as any),
      },
    });
    return result;
  });
}
