import { randomString } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/email/client';

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 15;

export async function createEmailVerification(userId: string, email: string) {
  const otp = randomString(OTP_LENGTH).toUpperCase();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  // Invalidate any outstanding OTPs for this user/email.
  await prisma.emailVerification.deleteMany({ where: { userId } });
  const record = await prisma.emailVerification.create({
    data: { userId, email, otp, expiresAt },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verifyUrl = `${appUrl}/api/account/verify-email?token=${record.id}&email=${encodeURIComponent(
    email,
  )}`;
  const html = `
    <h1>Verify your email</h1>
    <p>Enter this OTP to verify your email address:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>
    <p>Or click the link below:</p>
    <a href="${verifyUrl}">Verify email</a>
    <p>This OTP expires in ${OTP_TTL_MINUTES} minutes.</p>
  `;
  await sendMail({ to: email, subject: 'Verify your email — StockForge AI', html });
  return { id: record.id, expiresAt };
}

export async function verifyEmail(token: string, email: string) {
  const record = await prisma.emailVerification.findUnique({ where: { id: token } });
  if (!record) return { ok: false, error: 'invalid_token' };
  if (record.email !== email) return { ok: false, error: 'email_mismatch' };
  if (record.usedAt) return { ok: false, error: 'already_used' };
  if (record.expiresAt < new Date()) return { ok: false, error: 'expired' };
  await prisma.emailVerification.update({
    where: { id: token },
    data: { usedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerified: new Date() },
  });
  return { ok: true };
}

export async function verifyEmailOtp(userId: string, otp: string) {
  const record = await prisma.emailVerification.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return { ok: false, error: 'no_pending_otp' };
  if (record.otp !== otp.toUpperCase()) {
    await prisma.emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: 'invalid_otp' };
  }
  await prisma.emailVerification.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerified: new Date() },
  });
  return { ok: true };
}

export async function resendEmailOtp(userId: string, email: string) {
  return createEmailVerification(userId, email);
}
