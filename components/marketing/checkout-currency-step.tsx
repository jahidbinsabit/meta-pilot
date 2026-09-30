'use client';

import { Globe, Wallet } from 'lucide-react';
import { formatCheckoutAmount } from '@/lib/payments/public';
import { planAmount, type CheckoutPlan } from './checkout-helpers';

function CurrencyCard({
  label,
  amount,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string;
  amount: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-accent hover:bg-accent/10"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold">{amount}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

export function CurrencyStep({
  plan,
  onSelectUSD,
  onSelectBDT,
}: {
  plan: CheckoutPlan;
  onSelectUSD: () => void;
  onSelectBDT: () => void;
}) {
  const usdAmount = planAmount(plan, 'USD');
  const bdtAmount = planAmount(plan, 'BDT');

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CurrencyCard
        label="BDT"
        amount={formatCheckoutAmount('BDT', bdtAmount)}
        hint="bKash, Nagad, Rocket, Bank"
        icon={Wallet}
        onClick={onSelectBDT}
      />
      <CurrencyCard
        label="USD"
        amount={formatCheckoutAmount('USD', usdAmount)}
        hint="International cards via Stripe"
        icon={Globe}
        onClick={onSelectUSD}
      />
    </div>
  );
}

