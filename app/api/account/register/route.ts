import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createEmailVerification } from '@/lib/email/verification';

const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'USER',
        membership: 'FREE',
        credits: 0,
      },
    });

    // First-login bootstrap: 0-balance wallet + Free membership.
    // `CreditWallet.balance` is the source of truth; mirror it onto
    // `User.credits` so the session token and dashboard agree.
    await prisma.creditWallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, balance: 0 },
    });

    const trial = Number(process.env.TRIAL_CREDITS || 0);
    if (trial > 0) {
      await prisma.creditWallet.update({
        where: { userId: user.id },
        data: { balance: trial },
      });
      await prisma.user.update({ where: { id: user.id }, data: { credits: trial } });
      await prisma.creditTransaction.create({
        data: { userId: user.id, amount: trial, type: 'CREDIT', reason: 'welcome_trial' },
      });
    }

    // Send the OTP verification email.
    await createEmailVerification(user.id, email);

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e: any) {
    console.error('register failed', e);
    return NextResponse.json({ error: 'registration_failed' }, { status: 500 });
  }
}
