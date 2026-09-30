import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyEmail, verifyEmailOtp, resendEmailOtp } from '@/lib/email/verification';

const VerifySchema = z.object({
  token: z.string(),
  email: z.string().trim().toLowerCase().email(),
});

const OtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().min(4).max(8),
});

const ResendSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/** Magic-link style verification: click the link in the email. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  if (!token || !email) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }
  const result = await verifyEmail(token, email);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** OTP verification (alternative to the magic link). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = OtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { email, otp } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    const result = await verifyEmailOtp(user.id, otp);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'verification_failed' }, { status: 500 });
  }
}

/** Resend the verification email. */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const parsed = ResendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { email } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }
    await resendEmailOtp(user.id, email);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'resend_failed' }, { status: 500 });
  }
}
