import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { buildCheckoutGateways } from '@/lib/payments/public';
import { PricingPlans } from '@/components/marketing/pricing-plans';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
    if (settings) {
      const pricingTitle = 'Pricing — StockForge AI';
      const pricingDescription =
        'Simple, creator-first pricing for AI metadata generation. Pay in USD with Stripe or in BDT with bKash and Nagad.';

      return {
        title: pricingTitle,
        description: pricingDescription,
        openGraph: {
          title: pricingTitle,
          description: pricingDescription,
          type: 'website',
          images: settings.ogImageUrl ? [settings.ogImageUrl] : undefined,
        },
        twitter: {
          card: 'summary_large_image',
          title: pricingTitle,
          description: pricingDescription,
          images: settings.ogImageUrl ? [settings.ogImageUrl] : undefined,
          creator: settings.twitterHandle ?? undefined,
        },
      };
    }
  } catch (error) {
    console.error('Error fetching site settings for pricing metadata:', error);
  }

  return {
    title: 'Pricing — StockForge AI',
    description:
      'Simple, creator-first pricing for AI metadata generation. Pay in USD with Stripe or in BDT with bKash and Nagad.',
    openGraph: {
      title: 'Pricing — StockForge AI',
      description: 'Simple, creator-first pricing for AI metadata generation.',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Pricing — StockForge AI',
      description: 'Simple, creator-first pricing for AI metadata generation.',
    },
  };
}

const PLAN_COPY: Record<
  string,
  { description: string; features: string[]; cta: string; highlight: boolean }
> = {
  FREE: {
    description: 'For testing the waters.',
    features: ['Metadata generator', 'Image → Prompt', 'Basic analytics', 'Community support'],
    cta: 'Get started',
    highlight: false,
  },
  PRO: {
    description: 'For active creators.',
    features: [
      'Everything in Free',
      'Batch generation',
      'Full Adobe analytics',
      'Priority support',
      'API access',
      'Custom prompts',
    ],
    cta: 'Choose Pro',
    highlight: true,
  },
  PLUS: {
    description: 'For growing studios.',
    features: [
      'Everything in Pro',
      'Higher monthly credits',
      'Expanded analytics limits',
      'Team-ready workflows',
      'Faster support',
    ],
    cta: 'Choose Plus',
    highlight: false,
  },
  AGENCY: {
    description: 'For teams and agencies.',
    features: [
      'Everything in Plus',
      'Highest credit volume',
      'Unlimited analytics results',
      'Priority onboarding',
      'Account manager',
    ],
    cta: 'Choose Agency',
    highlight: false,
  },
};

async function getPricingData() {
  try {
    const [plans, gateways] = await Promise.all([
      prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.paymentGatewayConfig.findMany({
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return {
      plans: plans.map((plan) => {
        const copy = PLAN_COPY[plan.tier] || {
          description: plan.name,
          features: [
            plan.creditsIncluded > 0
              ? `${plan.creditsIncluded.toLocaleString()} credits / month`
              : `${plan.dailyFreeCredits} free credits / day`,
          ],
          cta: `Choose ${plan.name}`,
          highlight: plan.tier === 'PRO',
        };
        return {
          id: plan.id,
          name: plan.name,
          tier: plan.tier,
          monthlyPriceUSD: plan.monthlyPriceUSD,
          monthlyPriceBDT: plan.monthlyPriceBDT,
          creditsIncluded: plan.creditsIncluded,
          dailyFreeCredits: plan.dailyFreeCredits,
          ...copy,
        };
      }),
      gateways: buildCheckoutGateways(gateways),
    };
  } catch (error) {
    console.error('Failed to load pricing data:', error);
    return { plans: [], gateways: buildCheckoutGateways([]) };
  }
}

export default async function PricingPage() {
  const { plans, gateways } = await getPricingData();

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Pricing
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
          Simple, creator-first pricing
        </h1>
        <p className="mt-3 text-muted-foreground">
          Pay in USD with Stripe, or in BDT with bKash and Nagad. Credits roll over on paid plans.
        </p>
      </div>

      {plans.length > 0 ? (
        <PricingPlans plans={plans} gateways={gateways} />
      ) : (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          Plans will appear here once they are published.
        </p>
      )}
    </div>
  );
}
