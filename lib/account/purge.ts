import { prisma } from '@/lib/db';
import { listFiles, deleteFile } from '@/lib/s3/client';

/**
 * Hard purge for soft-deleted accounts (garbage report §2).
 *
 * `DELETE /api/account` only MARKS a user (`deletedAt` +
 * `deletedPurgeAt = +30 days`); until this sweep existed, nothing ever
 * read `deletedPurgeAt`, so "deleted" accounts — and everything they
 * owned — were kept forever despite the 30-day purge promise.
 *
 * Per due user, in order:
 *   1. Delete their storage objects under `uploads/`, `previews/` and
 *      `avatars/` (generation files under the first two are TTL'd by the
 *      cleanup cron anyway, but avatar files and anything written after
 *      the last cron run must not outlive the account).
 *   2. Delete/anonymise the rows that have NO foreign-key cascade to
 *      User in the schema: `CouponRedemption` (userId is a plain column)
 *      is deleted; `AiCallLog.userId` (nullable, no relation) is nulled
 *      so cost history survives without pointing at a person.
 *   3. Hard-delete the user row. Every other user-owned model
 *      (Account, Session, ToolJob, ToolUsage, CreditWallet,
 *      CreditTransaction, Payment, Membership, ApiKey,
 *      AdobeAnalyticsQuery, EmailVerification, GeneratedMetadata)
 *      declares `onDelete: Cascade` on its user relation, so the
 *      database removes them with the user.
 *
 * Failures are counted and logged per user; one bad account never
 * aborts the sweep, and this function never throws.
 */

const PURGE_BATCH_LIMIT = 50;
const STORAGE_PREFIXES = ['uploads/', 'previews/', 'avatars/'] as const;

export async function purgeDeletedUsers(): Promise<{
  users: number;
  filesDeleted: number;
  failures: number;
}> {
  let users = 0;
  let filesDeleted = 0;
  let failures = 0;

  let due: Array<{ id: string }> = [];
  try {
    due = await prisma.user.findMany({
      where: {
        deletedAt: { not: null },
        deletedPurgeAt: { lt: new Date() },
      },
      select: { id: true },
      orderBy: { deletedPurgeAt: 'asc' },
      take: PURGE_BATCH_LIMIT,
    });
  } catch (err) {
    console.error('[account-purge] could not list due users:', err);
    return { users: 0, filesDeleted: 0, failures: 1 };
  }

  for (const { id: userId } of due) {
    try {
      // 1. Storage objects owned by the user.
      for (const prefix of STORAGE_PREFIXES) {
        try {
          const files = await listFiles(`${prefix}${userId}/`);
          for (const file of files) {
            try {
              await deleteFile(file.key);
              filesDeleted++;
            } catch (fileErr) {
              failures++;
              console.error(`[account-purge] failed to delete ${file.key}:`, fileErr);
            }
          }
        } catch (listErr) {
          failures++;
          console.error(`[account-purge] failed to list ${prefix}${userId}/:`, listErr);
        }
      }

      // 2. Rows with no FK cascade to User.
      await prisma.couponRedemption.deleteMany({ where: { userId } });
      await prisma.aiCallLog.updateMany({
        where: { userId },
        data: { userId: null },
      });

      // 3. Hard delete — schema cascades remove everything else.
      await prisma.user.delete({ where: { id: userId } });
      users++;
    } catch (userErr) {
      failures++;
      console.error(`[account-purge] purge failed for user ${userId}:`, userErr);
    }
  }

  if (users > 0 || failures > 0) {
    console.log(
      `[account-purge] purged ${users} user(s), deleted ${filesDeleted} file(s), ${failures} failure(s)`,
    );
  }
  return { users, filesDeleted, failures };
}
