import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { CredentialsSignin } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Thrown when the login rate limit is hit — surfaced as "too_many_attempts". */
class LoginRateLimited extends CredentialsSignin {
  code = 'too_many_attempts';
}

/** Idempotent daily free-credit grant. Runs on every login so free-tier
 *  users get their allowance without needing a cron. */
async function grantDailyFreeIfDue(userId: string) {
  const { grantDailyFree } = await import('@/lib/credits/engine');
  await grantDailyFree(userId);
}

/** Signup credit amount: admin setting first, TRIAL_CREDITS env fallback.
 *  Mirrors the register route so OAuth signups get the same amount. */
async function getInitialCredits(): Promise<number> {
  try {
    const { getSiteSettings } = await import('@/lib/site-settings');
    const siteSettings = await getSiteSettings();
    if (siteSettings && typeof siteSettings.signupCredits === 'number' && siteSettings.signupCredits >= 0) {
      return siteSettings.signupCredits;
    }
  } catch {
    /* fall through to env default */
  }
  const trialRaw = process.env.TRIAL_CREDITS;
  const trial = trialRaw !== undefined && trialRaw !== '' ? Number(trialRaw) : 20;
  return isNaN(trial) || trial < 0 ? 20 : trial;
}

// ---------------------------------------------------------------------------
// Auth options
// ---------------------------------------------------------------------------

export const authOptions: any = {
  adapter: PrismaAdapter(prisma),
  // NextAuth v5 reads AUTH_SECRET (falls back to NEXTAUTH_SECRET).
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  // Required on Vercel / custom domains so Auth.js trusts the Host header.
  trustHost: true,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: 'consent',
                access_type: 'offline',
                response_type: 'code',
              },
            },
            issuer: 'https://accounts.google.com',
            wellKnown: 'https://accounts.google.com/.well-known/openid-configuration',
            // H3 hardening (R7): NEVER link a Google sign-in to an existing
            // account just because the email matches. Registration does not
            // verify email ownership (SMTP is parked), so email-match linking
            // let an attacker pre-register a victim's email with a password
            // and later take over / be merged into the victim's Google
            // identity. Linking is now adapter-managed only, keyed by the
            // provider account id.
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: any, request: any) {
        if (!credentials?.email || !credentials?.password) return null;
        // Rate-limit credential-stuffing: 10 attempts/min per IP.
        try {
          const req = request instanceof Request ? request : undefined;
          const ip = req ? getClientIp(req) : 'unknown';
          const rl = rateLimit(`login:${ip}`, { max: 10, windowMs: 60_000 });
          if (!rl.allowed) throw new LoginRateLimited();
        } catch (e) {
          if (e instanceof LoginRateLimited) throw e;
          // If IP detection fails, fail open (don't block legitimate logins).
        }
        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email).trim().toLowerCase() },
        });
        if (!user) return null;
        // Suspended or soft-deleted users cannot log in.
        if ((user as any).deletedAt) return null;
        if ((user as any).status === 'SUSPENDED') return null;
        const hash = (user as any).passwordHash as string | null;
        let ok = false;
        if (hash) {
          ok = await bcrypt.compare(credentials.password, hash);
        }
        // NOTE: SEED_PASSWORD fallback removed (security fix 19 Oct 2026).
        // Previously any account without a passwordHash (e.g. Google-OAuth users)
        // could be logged into with just the email + SEED_PASSWORD.
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
  // JWT session strategy: role + membershipPlan embedded in the token,
  // refreshed on membership change (see jwt callback + session callback).
  session: { 
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }: any) {
      // First sign-in: `user` is the raw provider-returned object.
      if (user?.id) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;

        // H3 hardening (R7): the manual email-match account linking that
        // used to live here has been REMOVED. It merged a Google sign-in
        // into any pre-existing account with the same email — combined with
        // unverified password registration, that was an account
        // pre-hijacking path. Account linking is now left to the Prisma
        // adapter, keyed by provider account id only; a Google sign-in
        // whose email matches an existing password account will NOT merge.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { plan: true },
              orderBy: { startedAt: 'desc' },
              take: 1,
            },
          },
        });
        if (dbUser) {
          // OAuth first-signin wallet bootstrap — uses the admin signup-credits
          // setting (same as the register route), env fallback.
          const initialCredits = await getInitialCredits();

          // Check if wallet exists or if it was initialized with 0 credits and no transactions
          const wallet = await prisma.creditWallet.findUnique({ where: { userId: dbUser.id } });
          let userCredits = wallet?.balance ?? dbUser.credits;

          if (!wallet) {
            await prisma.creditWallet.create({
              data: { userId: dbUser.id, balance: initialCredits },
            });
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { credits: initialCredits },
            });
            if (initialCredits > 0) {
              await prisma.creditTransaction.create({
                data: {
                  userId: dbUser.id,
                  amount: initialCredits,
                  type: 'BONUS',
                  reason: 'welcome_trial',
                },
              });
            }
            userCredits = initialCredits;
          } else if (wallet.balance === 0 && dbUser.credits === 0) {
            const txCount = await prisma.creditTransaction.count({ where: { userId: dbUser.id } });
            if (txCount === 0 && initialCredits > 0) {
              await prisma.creditWallet.update({
                where: { userId: dbUser.id },
                data: { balance: initialCredits },
              });
              await prisma.user.update({
                where: { id: dbUser.id },
                data: { credits: initialCredits },
              });
              await prisma.creditTransaction.create({
                data: {
                  userId: dbUser.id,
                  amount: initialCredits,
                  type: 'BONUS',
                  reason: 'welcome_trial',
                },
              });
              userCredits = initialCredits;
            }
          }

          const activeMembership =
            dbUser.memberships[0]?.plan?.tier || dbUser.membership || 'FREE';
          token.role = dbUser.role;
          token.membershipPlan = activeMembership;
          token.credits = userCredits;
          token.sub = dbUser.id;
          // Run the daily grant on every login.
          await grantDailyFreeIfDue(dbUser.id).catch(() => {});
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token?.sub) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).membershipPlan = token.membershipPlan;
        (session.user as any).credits = token.credits;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }: any) {
      if (user.id) {
        // First-login bootstrap: wallet + Free membership.
        // `CreditWallet.balance` is the source of truth; the credit engine
        // mirrors it onto `User.credits` on every movement.
        // Uses the admin signup-credits setting (same as the register route).
        const initialCredits = await getInitialCredits();

        await prisma.user.update({
          where: { id: user.id },
          data: { membership: 'FREE', credits: initialCredits },
        });
        await prisma.creditWallet.upsert({
          where: { userId: user.id },
          update: { balance: initialCredits },
          create: { userId: user.id, balance: initialCredits },
        });
        // Mirror onto User.credits so the session token / dashboard read
        // the same value the wallet holds.
        if (initialCredits > 0) {
          await prisma.creditTransaction.create({
            data: { userId: user.id, amount: initialCredits, type: 'BONUS', reason: 'welcome_trial' },
          });
        }
      }
    },
  },
};
