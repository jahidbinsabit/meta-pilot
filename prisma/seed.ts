import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { TOOL_SLUGS } from '@/lib/tools/slugs';

// ---------------------------------------------------------------------------
// Tool feature flags per plan tier.
// Every tool slug is accounted for so no tier silently unlocks nothing.
// ---------------------------------------------------------------------------
const ALL_TOOLS: Record<string, boolean> = Object.fromEntries(TOOL_SLUGS.map((s) => [s, true]));
const FREE_TOOLS: Record<string, boolean> = {
  'metadata-generator': true,
  'image-to-prompt': true,
  'keyword-clustering': true,
  'title-ab': true,
  'alt-text': true,
  palette: true,
  'keyword-density': true,
  'contrast-checker': true,
  'batch-export': true,
  'adobe-analytics': false,
  'bg-remover': false,
  'bento-builder': false,
  'ascii-vision': false,
  events: true,
  'adobe-keywords': false,
  'ai-eps-to-jpg': true,
  'halftone-studio': false,
  'dither-studio': false,
  'image-to-psd': false,
};

const PLANS = [
  {
    name: 'Free',
    tier: 'FREE' as const,
    monthlyPriceBDT: 0,
    monthlyPriceUSD: 0,
    creditsIncluded: 0,
    dailyFreeCredits: 5,
    adobeAnalyticsResultLimit: 0,
    features: FREE_TOOLS,
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'Pro',
    tier: 'PRO' as const,
    monthlyPriceBDT: 2500,
    monthlyPriceUSD: 29,
    creditsIncluded: 500,
    dailyFreeCredits: 0,
    adobeAnalyticsResultLimit: 100,
    features: { ...ALL_TOOLS },
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Plus',
    tier: 'PLUS' as const,
    monthlyPriceBDT: 6000,
    monthlyPriceUSD: 69,
    creditsIncluded: 1500,
    dailyFreeCredits: 0,
    adobeAnalyticsResultLimit: 500,
    features: { ...ALL_TOOLS },
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Agency',
    tier: 'AGENCY' as const,
    monthlyPriceBDT: 20000,
    monthlyPriceUSD: 199,
    creditsIncluded: 5000,
    dailyFreeCredits: 0,
    adobeAnalyticsResultLimit: -1, // unlimited
    features: { ...ALL_TOOLS },
    isActive: true,
    sortOrder: 3,
  },
];

const PACKAGES = [
  { name: 'Starter', credits: 100, priceBDT: 500, priceUSD: 5, isActive: true, sortOrder: 0 },
  { name: 'Pro', credits: 300, priceBDT: 1500, priceUSD: 15, isActive: true, sortOrder: 1 },
  { name: 'Plus', credits: 1000, priceBDT: 4500, priceUSD: 45, isActive: true, sortOrder: 2 },
  { name: 'Agency', credits: 3000, priceBDT: 12000, priceUSD: 120, isActive: true, sortOrder: 3 },
];

const GATEWAYS = [
  {
    gatewayKey: 'bkash_manual',
    displayName: 'bKash',
    isEnabled: false, // disabled until admin adds credentials
    isManual: true,
    credentialsJson: encryptSecret(
      JSON.stringify({ appKey: '', appPassword: '', username: '', password: '' }),
    ),
    sortOrder: 0,
  },
  {
    gatewayKey: 'nagad_manual',
    displayName: 'Nagad',
    isEnabled: false,
    isManual: true,
    credentialsJson: encryptSecret(
      JSON.stringify({ appKey: '', appPassword: '', username: '', password: '' }),
    ),
    sortOrder: 1,
  },
  {
    gatewayKey: 'stripe',
    displayName: 'Stripe',
    isEnabled: false,
    isManual: false,
    credentialsJson: encryptSecret(JSON.stringify({ secretKey: '', webhookSecret: '' })),
    sortOrder: 2,
  },
];

async function main() {
  // ---- Plans ----
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { tier: p.tier },
      update: { ...p, updatedAt: new Date() },
      create: { ...p },
    });
  }
  console.log(`Seeded ${PLANS.length} plans`);

  // ---- Credit packages ----
  for (const c of PACKAGES) {
    await prisma.creditPackage.upsert({
      where: { name: c.name },
      update: { ...c, updatedAt: new Date() },
      create: { ...c },
    });
  }
  console.log(`Seeded ${PACKAGES.length} credit packages`);

  // ---- Admin user ----
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@stockforge.local';
  const seedPassword = process.env.SEED_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', passwordHash, membership: 'ENTERPRISE', credits: 10000 },
    create: {
      email: adminEmail,
      name: 'StockForge Admin',
      role: 'ADMIN',
      membership: 'ENTERPRISE',
      credits: 10000,
      passwordHash,
    },
  });

  // Ensure the admin has a credit wallet. `User.credits` and
  // `CreditWallet.balance` are kept in sync by the credit engine, so the
  // wallet balance is the source of truth — seed it to match.
  await prisma.creditWallet.upsert({
    where: { userId: admin.id },
    update: { balance: 10000 },
    create: { userId: admin.id, balance: 10000 },
  });

  // ---- AI provider configs ----
  const geminiTools = Object.fromEntries(TOOL_SLUGS.map((s) => [s, s !== 'adobe-analytics']));
  await prisma.aiProviderConfig.upsert({
    where: { provider: 'gemini' },
    update: { updatedAt: new Date(), updatedBy: admin.id },
    create: {
      provider: 'gemini',
      apiKey: encryptSecret(process.env.GEMINI_API_KEY || ''),
      modelDefault: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      enabled: true,
      updatedBy: admin.id,
    },
  });

  await prisma.aiProviderConfig.upsert({
    where: { provider: 'openai' },
    update: { updatedAt: new Date(), updatedBy: admin.id },
    create: {
      provider: 'openai',
      apiKey: encryptSecret(process.env.OPENAI_API_KEY || ''),
      modelDefault: process.env.OPENAI_MODEL || 'gpt-4o',
      enabled: false,
      updatedBy: admin.id,
    },
  });
  console.log('Seeded AI provider configs');

  // ---- Payment gateway configs (all disabled until admin adds credentials) ----
  for (const g of GATEWAYS) {
    await prisma.paymentGatewayConfig.upsert({
      where: { gatewayKey: g.gatewayKey },
      update: { ...g, updatedAt: new Date() },
      create: { ...g },
    });
  }
  console.log(`Seeded ${GATEWAYS.length} payment gateway configs`);

  // ---- Tool registry (PROMPT 9.7 / PROMPT 10) ----
  const { seedToolRegistry } = await import('@/lib/tools/registry');
  const seeded = await seedToolRegistry();
  console.log(`Seeded ${seeded} tool registry rows`);

  // ---- Default generator settings snapshot ----
  await prisma.generatorSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      titleLength: 60,
      descriptionLength: 180,
      keywordsCount: 12,
      prefix: 'Professional ',
      suffix: ' — high quality stock photo',
      negativeTitleWords: ['blurry', 'low quality', 'bad', 'ugly'],
      negativeKeywords: ['blurry', 'low quality', 'bad', 'ugly'],
    },
  });

  console.log('Seed complete. Admin:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
