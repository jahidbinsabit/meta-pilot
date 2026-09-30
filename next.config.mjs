/** @type {import('next').NextConfig} */

// NextAuth v5 reads AUTH_SECRET; keep NEXTAUTH_SECRET working as an alias.
if (!process.env.AUTH_SECRET && process.env.NEXTAUTH_SECRET) {
  process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
}
if (!process.env.AUTH_URL && process.env.NEXTAUTH_URL) {
  process.env.AUTH_URL = process.env.NEXTAUTH_URL;
}

// Prisma validates DATABASE_URL at first query. During `next build` on Vercel
// the URL may be unset / a placeholder, which would crash static generation.
const isBuild =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-development-build';
if (isBuild && (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL))) {
  process.env.DATABASE_URL = 'postgresql://build:build@127.0.0.1:5432/build';
}

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'gravatar.com' },
      { protocol: 'https', hostname: '**' }, // stock image CDN hosts
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  },
  // Dockerized-node note: output: 'standalone' for standalone deploys
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
};

export default nextConfig;

