import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSiteSettings } from '@/lib/site-settings';
import { createEmailVerification } from '@/lib/email/verification';
import { isDisposableEmailDomain } from '@/lib/email/disposable';
import { getClientIp, rateLimitResponse } from '@/lib/rate-limit';

/** Signup-bonus farming cap (R9 S9-03): at most this many accounts per
 * signup IP per rolling 24h receive the welcome bonus. Further accounts
 * are created normally, just without the bonus. */
const SIGNUP_BONUS_PER_IP_PER_DAY = 3;

const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export async function POST(req: Request) {
  // Rate limit: 5 registrations per minute per IP (anti-spam).
  const limited = rateLimitResponse(req, { max: 5, windowMs: 60_000, scope: 'register' });
  if (limited) return limited;

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

    // R9 S9-03: reject throwaway inboxes outright — they can never
    // receive the verification OTP and exist here only to farm bonuses.
    if (isDisposableEmailDomain(email)) {
      return NextResponse.json(
        {
          error: 'disposable_email',
          message: 'Please use a permanent email address to register.',
        },
        { status: 400 },
      );
    }

    const signupIp = getClientIp(req);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Do not reveal whether the email is registered (anti-enumeration).
      // Return a generic success so attackers cannot harvest registered emails.
      return NextResponse.json({
        ok: true,
        message: 'If this email is new, a verification code was sent',
      });
    }

    // Signup bonus credits: admin panel (Site settings) wins, then TRIAL_CREDITS env, then 20.
    let initialCredits = 20;
    try {
      const siteSettings = await getSiteSettings();
      if (siteSettings && typeof siteSettings.signupCredits === 'number' && siteSettings.signupCredits >= 0) {
        initialCredits = siteSettings.signupCredits;
      } else {
        const trialRaw = process.env.TRIAL_CREDITS;
        const trial = trialRaw !== undefined && trialRaw !== '' ? Number(trialRaw) : 20;
        initialCredits = isNaN(trial) || trial < 0 ? 20 : trial;
      }
    } catch {
      const trialRaw = process.env.TRIAL_CREDITS;
      const trial = trialRaw !== undefined && trialRaw !== '' ? Number(trialRaw) : 20;
      initialCredits = isNaN(trial) || trial < 0 ? 20 : trial;
    }

    // R9 S9-03: signup-bonus farming cap. Count accounts already created
    // from this IP in the last 24h; once the cap is reached the account
    // is still created, but with no bonus. Race-tolerant by design —
    // this is friction, not a vault. Skipped when no IP is attributable.
    if (initialCredits > 0 && signupIp && signupIp !== 'unknown') {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentFromIp = await prisma.user.count({
          where: { signupIp, createdAt: { gte: since } },
        });
        if (recentFromIp >= SIGNUP_BONUS_PER_IP_PER_DAY) {
          initialCredits = 0;
        }
      } catch (capErr) {
        console.error('register: signup bonus cap check failed (non-fatal)', capErr);
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        signupIp,
        role: 'USER',
        membership: 'FREE',
        credits: initialCredits,
      },
    });

    // First-login bootstrap: wallet + Free membership.
    // `CreditWallet.balance` is the source of truth; mirror it onto
    // `User.credits` so the session token and dashboard agree.
    await prisma.creditWallet.upsert({
      where: { userId: user.id },
      update: { balance: initialCredits },
      create: { userId: user.id, balance: initialCredits },
    });

    if (initialCredits > 0) {
      await prisma.creditTransaction.create({
        data: { userId: user.id, amount: initialCredits, type: 'BONUS', reason: 'welcome_trial' },
      });
    }

    // Send the OTP verification email — best-effort. If SMTP is down the
    // user is still created with credits; they can request a new OTP later.
    // (Security fix 19 Oct 2026: previously an SMTP failure returned 500
    // after the user row was committed, leaving the account in a state where
    // retry hit `email_taken`.)
    try {
      await createEmailVerification(user.id, email);
    } catch (mailErr) {
      console.error('register: verification email failed (non-fatal)', mailErr);
    }

    // M8: anti-enumeration — return the SAME neutral response as the
    // "already exists" path above, so attackers cannot tell registered
    // emails apart from new ones by message or shape. The account,
    // credits, and verification email are still created on the happy path.
    return NextResponse.json({
      ok: true,
      message: 'If this email is new, a verification code was sent',
    });
  } catch (e: any) {
    console.error('register failed', e);
    return NextResponse.json({ error: 'registration_failed' }, { status: 500 });
  }
}
