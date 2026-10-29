'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCheckoutAmount, type PublicGateway, type CheckoutCurrency } from '@/lib/payments/public';
import { CurrencyCheckoutDialog, type CheckoutPlan } from './currency-checkout-dialog';
import { takePendingCheckout } from './checkout-helpers';
import { useToast } from '@/components/ui/toast';

type PricingPlan = {
  id: string;
  name: string;
  type?: 'plan';
  tier: string;
  monthlyPriceUSD: number;
  monthlyPriceBDT: number;
  creditsIncluded: number;
  dailyFreeCredits: number;
  description: string;
  features: string[];
  cta: string;
  highlight: boolean;
};

export function PricingPlans({
  plans,
  gateways,
}: {
  plans: PricingPlan[];
  gateways: PublicGateway[];
}) {
  const [selected, setSelected] = React.useState<CheckoutPlan | null>(null);
  const [currency, setCurrency] = React.useState<CheckoutCurrency>('BDT');
  const toast = useToast();

  // T1-17: Stripe's cancel_url lands back here with ?canceled=1 — the
  // page used to ignore it, so a cancelled checkout looked like nothing
  // happened. Acknowledge it once and strip the param.
  // T1-18: restore a plan chosen before the login redirect.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('canceled') === '1') {
      toast({
        title: 'Payment canceled',
        description: 'No charge was made. Pick a plan whenever you are ready.',
        variant: 'info',
      });
      params.delete('canceled');
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }

    const pending = takePendingCheckout();
    if (pending && pending.type === 'plan') {
      const plan = plans.find((p) => p.id === pending.id);
      if (plan) {
        setCurrency(pending.currency);
        setSelected({ ...plan, preSelectedCurrency: pending.currency });
      }
    }
    // Mount-only: `plans` is the server-rendered list for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Currency Toggle */}
      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setCurrency('BDT')}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              currency === 'BDT'
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            BDT (৳)
          </button>
          <button
            type="button"
            onClick={() => setCurrency('USD')}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              currency === 'USD'
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            USD ($)
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const isFree = plan.monthlyPriceUSD <= 0 && plan.monthlyPriceBDT <= 0;
          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-xl border p-6',
                plan.highlight ? 'border-accent bg-card shadow-glow' : 'border-border bg-card',
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    {isFree
                      ? currency === 'USD'
                        ? '$0'
                        : '৳0'
                      : formatCheckoutAmount(
                          currency,
                          currency === 'USD' ? plan.monthlyPriceUSD : plan.monthlyPriceBDT,
                        )}
                  </span>
                  {!isFree && (
                    <span className="text-sm text-muted-foreground">one-time · 30 days of access</span>
                  )}
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-accent" />
                <span className="font-medium">
                  {plan.creditsIncluded > 0
                    ? `${plan.creditsIncluded.toLocaleString()} credits included`
                    : `${plan.dailyFreeCredits} free credits / day`}
                </span>
              </div>
              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              {isFree ? (
                <Link
                  href="/login"
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent/10"
                >
                  {plan.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSelected({ ...plan, preSelectedCurrency: currency });
                  }}
                  className={cn(
                    'mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold',
                    plan.highlight
                      ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                      : 'border border-border hover:bg-accent/10',
                  )}
                >
                  {plan.cta} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <CurrencyCheckoutDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        plan={selected}
        gateways={gateways}
      />
    </>
  );
}
