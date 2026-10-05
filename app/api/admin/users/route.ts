import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { addCredits, deductCredits, getWallet } from '@/lib/credits/engine';
import { withAudit, writeAudit } from '@/lib/audit';
import { encryptSecret } from '@/lib/crypto';
import { createId } from '@/lib/id';

/** GET /api/admin/users — paginated, searchable, filterable user list with stats. */
export async function GET(req: Request) {
  try {
    await requireApiAdmin();
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const role = url.searchParams.get('role')?.trim().toUpperCase() || '';
  const plan = url.searchParams.get('plan')?.trim().toUpperCase() || '';
  const status = url.searchParams.get('status')?.trim().toUpperCase() || '';
  const deleted = url.searchParams.get('deleted')?.trim() || 'active'; // 'active' | 'deleted' | 'all'
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || '25')));
  const skip = (page - 1) * pageSize;

  const where: any = {};

  if (deleted === 'active') {
    where.deletedAt = null;
  } else if (deleted === 'deleted') {
    where.deletedAt = { not: null };
  }

  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { id: { equals: q } },
    ];
  }

  if (role && (role === 'USER' || role === 'ADMIN')) {
    where.role = role as any;
  }

  if (plan && ['FREE', 'PRO', 'PLUS', 'AGENCY', 'ENTERPRISE'].includes(plan)) {
    where.membership = plan as any;
  }

  if (status && (status === 'ACTIVE' || status === 'SUSPENDED')) {
    where.status = status as any;
  }

  const [users, total, stats] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        role: true,
        membership: true,
        credits: true,
        status: true,
        geminiApiKey: true,
        openaiApiKey: true,
        grokApiKey: true,
        preferredAiProvider: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        creditWallet: true,
        memberships: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
    Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.user.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
      prisma.user.count({ where: { deletedAt: null, role: 'ADMIN' } }),
      prisma.user.count({ where: { deletedAt: null, membership: { not: 'FREE' } } }),
    ]).then(([totalUsers, activeUsers, suspendedUsers, adminUsers, paidUsers]) => ({
      totalUsers,
      activeUsers,
      suspendedUsers,
      adminUsers,
      paidUsers,
    })),
  ]);

  const sanitizedUsers = users.map((u) => ({
    ...u,
    hasGeminiKey: !!(u.geminiApiKey && u.geminiApiKey.trim()),
    hasOpenaiKey: !!(u.openaiApiKey && u.openaiApiKey.trim()),
    hasGrokKey: !!(u.grokApiKey && u.grokApiKey.trim()),
    geminiApiKey: undefined,
    openaiApiKey: undefined,
    grokApiKey: undefined,
  }));

  return NextResponse.json({
    users: sanitizedUsers,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    stats,
  });
} catch (err: any) {
  if (err?.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (err?.message === 'FORBIDDEN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ error: 'internal_error', message: err?.message || 'Server error' }, { status: 500 });
}
}

async function handleUserEdit(admin: any, user: any, body: any) {
  const {
    name,
    email,
    role,
    membership,
    status,
    emailVerified,
    password,
    credits,
    geminiApiKey,
    openaiApiKey,
    grokApiKey,
    preferredAiProvider,
    planId,
  } = body;
  const userId = user.id;
  const updateData: any = {};
  const before: any = {
    name: user.name,
    email: user.email,
    role: user.role,
    membership: user.membership,
    status: user.status,
    emailVerified: user.emailVerified,
    credits: user.credits,
    preferredAiProvider: user.preferredAiProvider,
  };

  if (email !== undefined) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }
    if (cleanEmail !== user.email.toLowerCase()) {
      const existing = await prisma.user.findFirst({
        where: { email: cleanEmail, id: { not: userId } },
      });
      if (existing) {
        return NextResponse.json({ error: 'email_taken', message: 'Email is already in use.' }, { status: 409 });
      }
      updateData.email = cleanEmail;
    }
  }

  if (name !== undefined) {
    updateData.name = typeof name === 'string' ? name.trim() || null : null;
  }

  if (role !== undefined) {
    const normRole = String(role).toUpperCase();
    if (normRole !== 'USER' && normRole !== 'ADMIN') {
      return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
    }
    updateData.role = normRole as any;
  }

  if (status !== undefined) {
    const normStatus = String(status).toUpperCase();
    if (normStatus !== 'ACTIVE' && normStatus !== 'SUSPENDED') {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    updateData.status = normStatus as any;
  }

  if (emailVerified !== undefined) {
    updateData.emailVerified = emailVerified ? (user.emailVerified || new Date()) : null;
  }

  if (password && typeof password === 'string' && password.trim().length > 0) {
    if (password.trim().length < 6) {
      return NextResponse.json({ error: 'password_too_short', message: 'Password min 6 chars.' }, { status: 400 });
    }
    updateData.passwordHash = await bcrypt.hash(password.trim(), 12);
  }

  if (geminiApiKey !== undefined) {
    updateData.geminiApiKey = typeof geminiApiKey === 'string' && geminiApiKey.trim() ? encryptSecret(geminiApiKey.trim()) : null;
  }
  if (openaiApiKey !== undefined) {
    updateData.openaiApiKey = typeof openaiApiKey === 'string' && openaiApiKey.trim() ? encryptSecret(openaiApiKey.trim()) : null;
  }
  if (grokApiKey !== undefined) {
    updateData.grokApiKey = typeof grokApiKey === 'string' && grokApiKey.trim() ? encryptSecret(grokApiKey.trim()) : null;
  }
  if (preferredAiProvider !== undefined) {
    updateData.preferredAiProvider = typeof preferredAiProvider === 'string' && preferredAiProvider.trim() ? preferredAiProvider.trim().toLowerCase() : 'auto';
  }

  let targetTier = user.membership;
  if (membership !== undefined) {
    const normTier = String(membership).toUpperCase();
    if (!['FREE', 'PRO', 'PLUS', 'AGENCY', 'ENTERPRISE'].includes(normTier)) {
      return NextResponse.json({ error: 'invalid_membership' }, { status: 400 });
    }
    if (normTier !== user.membership) {
      targetTier = normTier as any;
      updateData.membership = targetTier;
      await prisma.membership.updateMany({ where: { userId, status: 'ACTIVE' }, data: { status: 'CANCELED' } });
      if (targetTier !== 'FREE') {
        const targetPlan = planId
          ? await prisma.plan.findUnique({ where: { id: planId } })
          : await prisma.plan.findFirst({ where: { tier: targetTier as any, isActive: true } });
        if (targetPlan) {
          const renewsAt = new Date();
          renewsAt.setMonth(renewsAt.getMonth() + 1);
          await prisma.membership.create({
            data: { id: createId(), userId, planId: targetPlan.id, status: 'ACTIVE', renewsAt },
          });
        }
      }
    }
  }

  let finalBalance = user.credits;
  if (credits !== undefined && typeof credits === 'number' && Number.isInteger(credits)) {
    const targetCredits = Math.max(0, credits);
    const currentBalance = user.creditWallet?.balance ?? user.credits;
    const diff = targetCredits - currentBalance;
    if (diff !== 0) {
      await prisma.$transaction(async (tx) => {
        await tx.creditWallet.upsert({ where: { userId }, update: { balance: targetCredits }, create: { userId, balance: targetCredits } });
        await tx.user.update({ where: { id: userId }, data: { credits: targetCredits } });
        await tx.creditTransaction.create({ data: { userId, amount: diff, type: 'ADMIN_ADJUSTMENT', reason: `Admin set balance to ${targetCredits}` } });
      });
      finalBalance = targetCredits;
      updateData.credits = targetCredits;
    }
  }

  const updatedUser = await withAudit(
    { adminId: admin.id, action: 'user.edit', targetType: 'User', targetId: userId, before },
    (tx) => tx.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, emailVerified: true, role: true, membership: true, credits: true, status: true, geminiApiKey: true, openaiApiKey: true, grokApiKey: true, preferredAiProvider: true, deletedAt: true, createdAt: true, updatedAt: true },
    }),
  );

  return NextResponse.json({
    ok: true,
    user: {
      ...updatedUser,
      credits: finalBalance,
      hasGeminiKey: !!(updatedUser.geminiApiKey && updatedUser.geminiApiKey.trim()),
      hasOpenaiKey: !!(updatedUser.openaiApiKey && updatedUser.openaiApiKey.trim()),
      hasGrokKey: !!(updatedUser.grokApiKey && updatedUser.grokApiKey.trim()),
      geminiApiKey: undefined,
      openaiApiKey: undefined,
      grokApiKey: undefined,
    },
  });
}

/** POST /api/admin/users — admin actions */
export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin();
  const body = await req.json();
  const { userId, action } = body;

  if (!userId) return NextResponse.json({ error: 'user_id_required' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { creditWallet: true },
  });
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  switch (action) {
    case 'edit_user':
    case 'update_user':
      return handleUserEdit(admin, user, body);

    case 'set_password': {
      const { password } = body;
      if (!password || typeof password !== 'string' || password.trim().length < 6) {
        return NextResponse.json(
          { error: 'password_invalid', message: 'Password must be at least 6 characters long.' },
          { status: 400 },
        );
      }
      const passwordHash = await bcrypt.hash(password.trim(), 12);
      await withAudit(
        {
          adminId: admin.id,
          action: 'user.password.reset',
          targetType: 'User',
          targetId: userId,
          before: { email: user.email },
        },
        (tx) => tx.user.update({ where: { id: userId }, data: { passwordHash } }),
      );
      return NextResponse.json({ ok: true, message: 'Password updated successfully.' });
    }

    case 'adjust_credits': {
      const { amount, reason } = body;
      if (!reason || !reason.trim())
        return NextResponse.json({ error: 'reason_required' }, { status: 400 });
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
        return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
      }
      if (amount > 0) await addCredits(userId, amount, 'ADMIN_ADJUSTMENT', { reason });
      else await deductCredits(userId, -amount, 'ADMIN_ADJUSTMENT', { reason });
      await writeAudit({
        adminId: admin.id,
        action: 'user.credits.adjust',
        targetType: 'User',
        targetId: userId,
        before: { balance: user.credits },
        after: { amount, reason },
      });
      const w = await getWallet(userId);
      return NextResponse.json({ ok: true, balance: w.balance });
    }

    case 'set_credits': {
      const { balance, reason } = body;
      if (typeof balance !== 'number' || !Number.isInteger(balance) || balance < 0) {
        return NextResponse.json({ error: 'invalid_balance' }, { status: 400 });
      }
      const cleanReason = reason && typeof reason === 'string' ? reason.trim() : 'Manual balance adjustment';
      const currentBalance = user.creditWallet?.balance ?? user.credits;
      const diff = balance - currentBalance;
      if (diff !== 0) {
        await prisma.$transaction(async (tx) => {
          await tx.creditWallet.upsert({ where: { userId }, update: { balance }, create: { userId, balance } });
          await tx.user.update({ where: { id: userId }, data: { credits: balance } });
          await tx.creditTransaction.create({ data: { userId, amount: diff, type: 'ADMIN_ADJUSTMENT', reason: cleanReason } });
        });
        await writeAudit({
          adminId: admin.id,
          action: 'user.credits.set',
          targetType: 'User',
          targetId: userId,
          before: { balance: currentBalance },
          after: { balance, diff, reason: cleanReason },
        });
      }
      return NextResponse.json({ ok: true, balance });
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
      const before = { email: user.email, name: user.name, status: user.status, deletedAt: user.deletedAt };
      await withAudit(
        { adminId: admin.id, action: 'user.delete', targetType: 'User', targetId: userId, before },
        (tx) => tx.user.update({ where: { id: userId }, data: { deletedAt: new Date(), status: 'SUSPENDED' } }),
      );
      return NextResponse.json({ ok: true });
    }

    case 'restore': {
      const before = { email: user.email, name: user.name, status: user.status, deletedAt: user.deletedAt };
      await withAudit(
        { adminId: admin.id, action: 'user.restore', targetType: 'User', targetId: userId, before },
        (tx) => tx.user.update({ where: { id: userId }, data: { deletedAt: null, status: 'ACTIVE' } }),
      );
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  }
} catch (err: any) {
  if (err?.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (err?.message === 'FORBIDDEN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ error: 'internal_error', message: err?.message || 'Server error' }, { status: 500 });
}
}
