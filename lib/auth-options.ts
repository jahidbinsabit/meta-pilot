import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';
import { randomString } from '@/lib/utils';
import { decode } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Embed role + membershipPlan into the JWT so every request can read them
 *  without hitting the DB. Refreshed whenever the membership changes. */
async function buildSessionUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: { plan: true },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!user) return null;
  const activeMembership = user.memberships[0]?.plan?.tier || user.membership || 'FREE';
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    image: user.image ?? undefined,
    role: user.role,
    membershipPlan: activeMembership,
    credits: user.credits,
  };
}

/** Idempotent daily free-credit grant. Runs on every login so free-tier
 *  users get their allowance without needing a cron. */
async function grantDailyFreeIfDue(userId: string) {
  const { grantDailyFree } = await import('@/lib/credits/engine');
  await grantDailyFree(userId);
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
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: any) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email).trim().toLowerCase() },
        });
        if (!user) return null;
        const hash = (user as any).passwordHash as string | null;
        let ok = false;
        if (hash) {
          ok = await bcrypt.compare(credentials.password, hash);
        } else if (
          process.env.SEED_PASSWORD &&
          credentials.password === process.env.SEED_PASSWORD
        ) {
          ok = true;
        }
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
    async jwt({ token, user, account }: any) {
      // First sign-in: `user` is the raw provider-returned object.
      if (user?.id) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;

        // Google account linking: if the Google email matches an existing
        // user who hasn't linked Google yet, link the account to them.
        if (account?.provider === 'google' && user.email) {
          const existing = await prisma.user.findUnique({
            where: { email: user.email },
            include: { accounts: true },
          });
          if (existing && !existing.accounts.some((a) => a.provider === 'google')) {
            await prisma.account.create({
              data: {
                userId: existing.id,
                type: 'oauth',
                provider: 'google',
                providerAccountId: account.providerAccountId!,
                access_token: account.access_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
            });
            user.id = existing.id;
            token.sub = existing.id;
          }
        }
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
          const trialRaw = process.env.TRIAL_CREDITS;
          const trial = trialRaw !== undefined && trialRaw !== '' ? Number(trialRaw) : 20;
          const initialCredits = isNaN(trial) || trial < 0 ? 20 : trial;

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
        const trialRaw = process.env.TRIAL_CREDITS;
        const trial = trialRaw !== undefined && trialRaw !== '' ? Number(trialRaw) : 20;
        const initialCredits = isNaN(trial) || trial < 0 ? 20 : trial;

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
