'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Sparkles,
  CreditCard,
  Zap,
  ArrowRight,
  ShieldCheck,
  History,
  Wallet,
  Globe,
  ArrowUpRight,
  ArrowDownLeft,
  Smartphone,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatCheckoutAmount,
  type PublicGateway,
  type CheckoutCurrency,
} from '@/lib/payments/public';
import {
  CurrencyCheckoutDialog,
  type CheckoutPlan,
} from '@/components/marketing/currency-checkout-dialog';
import type { Plan, CreditPackage, Membership, Payment, CreditTransaction } from '@prisma/client';

interface BillingCheckoutProps {
  plans: Plan[];
  packages: CreditPackage[];
  gateways: PublicGateway[];
  currentMembership: (Membership & { plan: Plan }) | null;
  walletBalance: number;
  payments?: Payment[];
  transactions?: CreditTransaction[];
  userId: string;
}

const PLAN_FEATURES: Record<string, string[]> = {
  FREE: ['Metadata generator', 'Image → Prompt', 'Basic analytics', 'Community support'],
  PRO: [
    'Everything in Free',
    'Batch generation',
    'Full Adobe analytics',
    'Priority support',
    'API access',
    'Custom prompts',
  ],
  PLUS: [
    'Everything in Pro',
    'Higher monthly credits',
    'Expanded analytics limits',
    'Team-ready workflows',
    'Faster support',
  ],
  AGENCY: [
    'Everything in Plus',
    'Highest credit volume',
    'Unlimited analytics results',
    'Priority onboarding',
    'Dedicated support',
  ],
};

export function BillingCheckout({
  plans,
  packages,
  gateways,
  currentMembership,
  walletBalance,
  payments = [],
  transactions = [],
}: BillingCheckoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [currency, setCurrency] = React.useState<CheckoutCurrency>('BDT');
  const [selectedItem, setSelectedItem] = React.useState<CheckoutPlan | null>(null);

  // Check URL search params for success/cancel feedback on mount
  React.useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    if (success === '1') {
      toast({
        title: 'Payment Successful!',
        description: 'Your account balance and membership have been updated.',
        variant: 'success',
      });
      router.replace('/dashboard/billing');
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['credits-history'] });
    } else if (canceled === '1') {
      toast({
        title: 'Payment Canceled',
        description: 'You can try again whenever you are ready.',
        variant: 'info',
      });
      router.replace('/dashboard/billing');
    }
  }, [searchParams, toast, router, queryClient]);

  const handleTopupClick = (pkg: CreditPackage) => {
    setSelectedItem({
      id: pkg.id,
      name: pkg.name,
      type: 'credits',
      priceUSD: pkg.priceUSD,
      priceBDT: pkg.priceBDT,
      credits: pkg.credits,
      preSelectedCurrency: currency,
    });
  };

  const handlePlanClick = (plan: Plan) => {
    setSelectedItem({
      id: plan.id,
      name: plan.name,
      type: 'plan',
      tier: plan.tier,
      monthlyPriceUSD: plan.monthlyPriceUSD,
      monthlyPriceBDT: plan.monthlyPriceBDT,
      creditsIncluded: plan.creditsIncluded,
      dailyFreeCredits: plan.dailyFreeCredits,
      preSelectedCurrency: currency,
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Header & Currency Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Top Up</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your subscription plan, top up credits with USD or BDT, and view billing history.
          </p>
        </div>

        {/* Currency Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Currency:
          </span>
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrency('BDT')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors',
                currency === 'BDT'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Wallet className="h-3.5 w-3.5" />
              BDT (৳)
            </button>
            <button
              type="button"
              onClick={() => setCurrency('USD')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors',
                currency === 'USD'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              USD ($)
            </button>
          </div>
        </div>
      </div>

      {/* Account Balance & Current Plan Overview */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="relative overflow-hidden border-border bg-gradient-to-br from-card to-card/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                <Sparkles className="h-4 w-4 text-accent" />
                Available Balance
              </CardTitle>
              <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
                Active Wallet
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-foreground">
                {walletBalance.toLocaleString()}
              </span>
              <span className="text-sm font-medium text-muted-foreground">credits</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Credits are deducted automatically when using AI generation, prompt extraction, and analytics tools.
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border bg-gradient-to-br from-card to-card/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                <Crown className="h-4 w-4 text-accent" />
                Current Membership
              </CardTitle>
              <Badge
                variant={currentMembership ? 'default' : 'secondary'}
                className="capitalize"
              >
                {currentMembership ? currentMembership.status.toLowerCase() : 'Free Tier'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {currentMembership?.plan.name || 'Free Plan'}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {currentMembership?.plan.creditsIncluded && currentMembership.plan.creditsIncluded > 0 ? (
                <span>
                  Includes {currentMembership.plan.creditsIncluded.toLocaleString()} credits / month.
                </span>
              ) : currentMembership?.plan.dailyFreeCredits ? (
                <span>
                  Includes {currentMembership.plan.dailyFreeCredits} free credits daily.
                </span>
              ) : (
                <span>Upgrade to Pro or Plus for monthly rollover credits and higher limits.</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="topup" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="topup" className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            Top Up Credits
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-1.5">
            <Crown className="h-4 w-4" />
            Subscription Plans
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1.5">
            <CreditCard className="h-4 w-4" />
            Payment History
          </TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            Credit Log
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TOP UP CREDITS */}
        <TabsContent value="topup" className="space-y-6">
          <div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Credit Packages</h2>
                <p className="text-sm text-muted-foreground">
                  One-time credit top-ups that never expire. Pay in {currency === 'USD' ? 'USD with Stripe' : 'BDT with bKash / Nagad'}.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {packages.map((pkg, idx) => {
                const amount = currency === 'USD' ? pkg.priceUSD : pkg.priceBDT;
                const formattedPrice = formatCheckoutAmount(currency, amount);
                const unitPrice =
                  pkg.credits > 0
                    ? currency === 'USD'
                      ? `$${(pkg.priceUSD / pkg.credits).toFixed(3)}`
                      : `৳${(pkg.priceBDT / pkg.credits).toFixed(2)}`
                    : '—';
                const isPopular = idx === 1 || pkg.name.toLowerCase().includes('pro') || pkg.name.toLowerCase().includes('popular');

                return (
                  <Card
                    key={pkg.id}
                    className={cn(
                      'relative flex flex-col justify-between overflow-hidden transition-all hover:border-accent/60 hover:shadow-md',
                      isPopular && 'border-accent bg-card shadow-glow',
                    )}
                  >
                    {isPopular && (
                      <span className="absolute right-3 top-3 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-semibold text-accent">
                        Popular
                      </span>
                    )}
                    <CardHeader className="pb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <CardTitle className="mt-3 text-lg font-semibold">{pkg.name}</CardTitle>
                      <CardDescription className="text-xs font-medium text-foreground">
                        {pkg.credits.toLocaleString()} Credits
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      <div>
                        <div className="text-3xl font-extrabold tracking-tight text-foreground">
                          {formattedPrice}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{unitPrice} per credit</p>
                      </div>

                      <Button
                        onClick={() => handleTopupClick(pkg)}
                        className={cn(
                          'w-full font-semibold',
                          isPopular ? 'bg-accent text-accent-foreground hover:bg-accent/90' : '',
                        )}
                        variant={isPopular ? 'default' : 'outline'}
                      >
                        Top up with {currency} <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {packages.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No credit packages are currently active. Please check back later.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: SUBSCRIPTION PLANS */}
        <TabsContent value="plans" className="space-y-6">
          <div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Subscription Plans</h2>
                <p className="text-sm text-muted-foreground">
                  Upgrade your plan for monthly credit allowances, batch processing, and Adobe Analytics.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const isCurrent = currentMembership?.planId === plan.id;
                const isFree = plan.monthlyPriceUSD <= 0 && plan.monthlyPriceBDT <= 0;
                const price = currency === 'USD' ? plan.monthlyPriceUSD : plan.monthlyPriceBDT;
                const formattedPrice = isFree ? (currency === 'USD' ? '$0' : '৳0') : formatCheckoutAmount(currency, price);
                const features = PLAN_FEATURES[plan.tier] || [
                  plan.creditsIncluded > 0
                    ? `${plan.creditsIncluded.toLocaleString()} credits / month`
                    : `${plan.dailyFreeCredits} free credits / day`,
                ];

                return (
                  <Card
                    key={plan.id}
                    className={cn(
                      'relative flex flex-col justify-between overflow-hidden transition-all',
                      isCurrent
                        ? 'border-emerald-500/50 bg-emerald-500/5 shadow-sm'
                        : plan.tier === 'PRO'
                          ? 'border-accent bg-card shadow-glow'
                          : 'border-border bg-card',
                    )}
                  >
                    {isCurrent ? (
                      <span className="absolute right-3 top-3 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                        Current Plan
                      </span>
                    ) : plan.tier === 'PRO' ? (
                      <span className="absolute right-3 top-3 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-semibold text-accent">
                        Recommended
                      </span>
                    ) : null}

                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg font-bold">{plan.name}</CardTitle>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold">{formattedPrice}</span>
                        {!isFree && <span className="text-xs text-muted-foreground">/mo</span>}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-accent">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="font-semibold">
                          {plan.creditsIncluded > 0
                            ? `${plan.creditsIncluded.toLocaleString()} credits / mo`
                            : `${plan.dailyFreeCredits} free credits / day`}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <ul className="space-y-2 border-t border-border/50 pt-3 text-xs">
                        {features.map((feat) => (
                          <li key={feat} className="flex items-start gap-2">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            <span className="text-muted-foreground">{feat}</span>
                          </li>
                        ))}
                      </ul>

                      {isCurrent ? (
                        <Button disabled className="w-full" variant="outline">
                          <Check className="mr-1.5 h-4 w-4 text-emerald-400" />
                          Active Plan
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handlePlanClick(plan)}
                          className={cn(
                            'w-full font-semibold',
                            plan.tier === 'PRO'
                              ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                              : '',
                          )}
                          variant={plan.tier === 'PRO' ? 'default' : 'outline'}
                        >
                          {isFree ? 'Select Free' : `Upgrade (${currency})`}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: PAYMENT HISTORY */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Payment History</CardTitle>
              <CardDescription>
                Records of your previous top-up and subscription transactions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No payment transactions found.
                </div>
              ) : (
                <div className="divide-y divide-border overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-3 pr-4 font-semibold">Date</th>
                        <th className="py-3 px-4 font-semibold">Method</th>
                        <th className="py-3 px-4 font-semibold">Amount</th>
                        <th className="py-3 px-4 font-semibold">Reference</th>
                        <th className="py-3 pl-4 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 font-normal">
                      {payments.map((p) => {
                        const dateStr = new Date(p.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        });
                        const amountStr =
                          p.amountUSD > 0
                            ? `$${p.amountUSD.toFixed(2)}`
                            : p.amountBDT > 0
                              ? `৳${p.amountBDT.toLocaleString()}`
                              : '—';

                        return (
                          <tr key={p.id} className="hover:bg-accent/5">
                            <td className="py-3 pr-4 text-xs text-muted-foreground">{dateStr}</td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1.5 font-medium">
                                {p.method.includes('STRIPE') ? (
                                  <CreditCard className="h-3.5 w-3.5 text-accent" />
                                ) : (
                                  <Smartphone className="h-3.5 w-3.5 text-amber-400" />
                                )}
                                {p.method.replace('_MANUAL', '')}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold">{amountStr}</td>
                            <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                              {p.transactionRef || p.id.slice(0, 10)}
                            </td>
                            <td className="py-3 pl-4 text-right">
                              <Badge
                                variant={
                                  p.status === 'COMPLETED'
                                    ? 'success'
                                    : p.status === 'PENDING'
                                      ? 'warning'
                                      : p.status === 'REJECTED'
                                        ? 'destructive'
                                        : 'muted'
                                }
                                className="capitalize"
                              >
                                {p.status.toLowerCase()}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: CREDIT LOG / LEDGER */}
        <TabsContent value="ledger" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Credit Transaction Log</CardTitle>
              <CardDescription>
                Detailed record of credits added, deducted, and granted daily.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No credit transactions recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-border overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-3 pr-4 font-semibold">Date</th>
                        <th className="py-3 px-4 font-semibold">Type</th>
                        <th className="py-3 px-4 font-semibold">Reason</th>
                        <th className="py-3 pl-4 font-semibold text-right">Credits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 font-normal">
                      {transactions.map((tx) => {
                        const dateStr = new Date(tx.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const isPositive = tx.amount > 0;

                        return (
                          <tr key={tx.id} className="hover:bg-accent/5">
                            <td className="py-3 pr-4 text-xs text-muted-foreground">{dateStr}</td>
                            <td className="py-3 px-4">
                              <Badge
                                variant={
                                  tx.type === 'PURCHASE'
                                    ? 'default'
                                    : tx.type === 'DAILY_GRANT'
                                      ? 'secondary'
                                      : isPositive
                                        ? 'outline'
                                        : 'secondary'
                                }
                                className="capitalize text-[11px]"
                              >
                                {tx.type.toLowerCase().replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {tx.reason || tx.relatedToolSlug || 'Credit movement'}
                            </td>
                            <td className="py-3 pl-4 text-right">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-0.5 font-bold',
                                  isPositive ? 'text-emerald-400' : 'text-amber-400',
                                )}
                              >
                                {isPositive ? (
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowDownLeft className="h-3.5 w-3.5" />
                                )}
                                {isPositive ? `+${tx.amount}` : tx.amount}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Gateways Support Footer */}
      {gateways.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>
              <strong>Supported Gateways:</strong>{' '}
              {gateways.map((g) => g.displayName).join(', ')}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Encrypted 256-bit SSL Secure Payments
          </span>
        </div>
      )}

      {/* Unified Currency Checkout Modal */}
      <CurrencyCheckoutDialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
        plan={selectedItem}
        gateways={gateways}
      />
    </div>
  );
}
