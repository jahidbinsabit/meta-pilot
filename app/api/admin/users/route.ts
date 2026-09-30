import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { addCredits, deductCredits, getWallet } from '@/lib/credits/engine';
import { withAudit } from '@/lib/audit';

/** GET /api/admin/users — paginated, searchable, filterable user list. */
export async function GET(req: Request) {
  await requireApiAdmin();
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const plan = url.searchParams.get('plan')?.trim() || '';
  const status = url.searchParams.get('status')?.trim() || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = 25;
  const skip = (page - 1) * pageSize;

  const where: any = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (plan) where.membership = plan as any;
  if (status) where.status = status.toUpperCase() as any;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { creditWallet: true, memberships: { include: { plan: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, pageSize });
}

/** POST /api/admin/users — admin mutations: adjust credits, change role, suspend/reactivate/delete. */
export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  const body = await req.json();
  const { userId, action } = body;

  if (!userId) return NextResponse.json({ error: 'user_id_required' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  switch (action) {
    case 'adjust_credits': {
      const { amount, reason } = body;
      if (!reason || !reason.trim())
        return NextResponse.json({ error: 'reason_required' }, { status: 400 });
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
        return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
      }
      if (amount > 0) await addCredits(userId, amount, 'ADMIN_ADJUSTMENT', { reason });
      else await deductCredits(userId, -amount, 'ADMIN_ADJUSTMENT', { reason });
      await writeAudit(admin.id, 'user.credits.adjust', 'User', userId, { amount, reason });
      const w = await getWallet(userId);
      return NextResponse.json({ ok: true, balance: w.balance });
    }
    case 'set_role': {
      const { role } = body;
      if (role !== 'USER' && role !== 'ADMIN')
        return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
      const before = { role: user.role };
      const after = await withAudit(
        {
          adminId: admin.id,
          action: 'user.role.update',
          targetType: 'User',
          targetId: userId,
          before,
        },
        (tx) => tx.user.update({ where: { id: userId }, data: { role } }),
      );
      return NextResponse.json({ role: after.role });
    }
    case 'set_status': {
      const { status } = body;
      const normalized = String(status).toUpperCase();
      if (normalized !== 'ACTIVE' && normalized !== 'SUSPENDED') {
        return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
      }
      const before = { status: user.status };
      const after = await withAudit(
        {
          adminId: admin.id,
          action: 'user.status.update',
          targetType: 'User',
          targetId: userId,
          before,
        },
        (tx) => tx.user.update({ where: { id: userId }, data: { status: normalized } }),
      );
      return NextResponse.json({ status: after.status });
    }
    case 'set_membership': {
      const { membership: targetTier, planId } = body;
      const normalizedTier = String(targetTier || '').toUpperCase();
      const validTiers = ['FREE', 'PRO', 'PLUS', 'AGENCY', 'ENTERPRISE'];
      if (!validTiers.includes(normalizedTier)) {
        return NextResponse.json({ error: 'invalid_membership' }, { status: 400 });
      }

      const before = { membership: user.membership };

      const targetPlan = planId
        ? await prisma.plan.findUnique({ where: { id: planId } })
        : await prisma.plan.findFirst({ where: { tier: normalizedTier as any, isActive: true } });

      await prisma.membership.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'CANCELED' },
      });

      if (targetPlan && normalizedTier !== 'FREE') {
        const renewsAt = new Date();
        renewsAt.setMonth(renewsAt.getMonth() + 1);
        await prisma.membership.create({
          data: {
            id: (await import('@/lib/id')).createId(),
            userId,
            planId: targetPlan.id,
            status: 'ACTIVE',
            renewsAt,
          },
        });
      }

      const after = await withAudit(
        {
          adminId: admin.id,
          action: 'user.membership.update',
          targetType: 'User',
          targetId: userId,
          before,
        },
        (tx) => tx.user.update({ where: { id: userId }, data: { membership: normalizedTier as any } }),
      );
      return NextResponse.json({ membership: after.membership });
    }
    case 'delete': {
      const before = { email: user.email, name: user.name };
      await withAudit(
        { adminId: admin.id, action: 'user.delete', targetType: 'User', targetId: userId, before },
        (tx) => tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
      );
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  }
}

async function writeAudit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  data: Record<string, unknown>,
) {
  const { writeAudit: _audit } = await import('@/lib/audit');
  await _audit({ adminId, action, targetType, targetId, after: data });
}
