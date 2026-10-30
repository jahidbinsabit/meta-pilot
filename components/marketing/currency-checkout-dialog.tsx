'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PublicGateway } from '@/lib/payments/public';
import type { CheckoutPlan } from './checkout-helpers';
import { ManualPaymentForm } from './manual-payment-form';
import { CurrencyStep } from './checkout-currency-step';
import { GatewayStep } from './checkout-gateway-step';
import { useCurrencyCheckout } from './use-currency-checkout';

export type { CheckoutPlan };

export function CurrencyCheckoutDialog({
  open,
  onOpenChange,
  plan,
  gateways,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: CheckoutPlan | null;
  gateways: PublicGateway[];
}) {
  const checkout = useCurrencyCheckout({ open, onOpenChange, plan, gateways });
  if (!plan) return null;

  const title =
    checkout.step === 'currency'
      ? 'Choose Payment Currency'
      : checkout.step === 'gateway'
        ? `Pay ${checkout.formattedAmount} with ${checkout.currency}`
        : `${checkout.selectedGateway?.displayName} Manual Payment`;

  const description =
    plan.type === 'credits'
      ? `${plan.name} · ${plan.credits?.toLocaleString() || ''} credits`
      : `${plan.name} plan · ${
          plan.creditsIncluded && plan.creditsIncluded > 0
            ? `${plan.creditsIncluded.toLocaleString()} credits / month`
            : `${plan.dailyFreeCredits ?? 0} free credits / day`
        }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col p-0 overflow-hidden border border-border shadow-2xl">
        <DialogHeader className="px-5 py-4 pb-3 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <DialogTitle className="text-base sm:text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 overscroll-contain">
          {checkout.step === 'currency' && (
            <CurrencyStep
              plan={plan}
              onSelectUSD={() => {
                checkout.setCurrency('USD');
                checkout.setStep('gateway');
              }}
              onSelectBDT={() => {
                checkout.setCurrency('BDT');
                checkout.setStep('gateway');
              }}
            />
          )}
          {checkout.step === 'gateway' && (
            <GatewayStep
              currency={checkout.currency}
              formattedAmount={checkout.formattedAmount}
              gateways={checkout.shownGateways}
              busy={checkout.busy}
              onSelect={checkout.onSelectGateway}
              onBack={() => checkout.setStep('currency')}
            />
          )}
          {checkout.step === 'manual' && checkout.selectedGateway && (
            <ManualPaymentForm
              gateway={checkout.selectedGateway}
              formattedAmount={checkout.formattedAmount}
              senderNumber={checkout.senderNumber}
              setSenderNumber={checkout.setSenderNumber}
              transactionId={checkout.transactionId}
              setTransactionId={checkout.setTransactionId}
              busy={checkout.busy}
              onBack={() => checkout.setStep('gateway')}
              onSubmit={checkout.submitManual}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
