'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/ui/toast';
import { formatCheckoutAmount, type CheckoutCurrency, type PublicGateway } from '@/lib/payments/public';
import { gatewaysForCurrency, planAmount, type CheckoutPlan, type CheckoutStep } from './checkout-helpers';

export function useCurrencyCheckout({
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
  const router = useRouter();
  const toast = useToast();
  const { status } = useSession();
  const [step, setStep] = React.useState<CheckoutStep>('currency');
  const [currency, setCurrency] = React.useState<CheckoutCurrency>('BDT');
  const [selectedGateway, setSelectedGateway] = React.useState<PublicGateway | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [senderNumber, setSenderNumber] = React.useState('');
  const [transactionId, setTransactionId] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setStep('currency');
      setCurrency(plan?.preSelectedCurrency || 'BDT');
      setSelectedGateway(null);
      setBusy(false);
      setSenderNumber('');
      setTransactionId('');
    } else if (open && plan?.preSelectedCurrency) {
      // If currency pre-selected, skip to gateway step
      setCurrency(plan.preSelectedCurrency);
      setStep('gateway');
    }
  }, [open, plan?.preSelectedCurrency]);

  const amount = plan ? planAmount(plan, currency) : 0;
  const formattedAmount = formatCheckoutAmount(currency, amount);
  const shownGateways = gatewaysForCurrency(gateways, currency);

  const requireLogin = () => {
    const returnPath = typeof window !== 'undefined' ? window.location.pathname : '/pricing';
    router.push(`/login?callbackUrl=${encodeURIComponent(returnPath)}`);
  };

  const startInternational = async (gateway: PublicGateway) => {
    if (!plan) return;
    if (status !== 'authenticated') return requireLogin();
    setBusy(true);
    try {
      const isCreditsItem = plan.type === 'credits';
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isCreditsItem ? 'credits' : 'plan',
          planId: !isCreditsItem ? plan.id : undefined,
          packageId: isCreditsItem ? plan.id : undefined,
          currency: 'USD',
          provider: gateway.gatewayKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start checkout');
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
        return;
      }
      toast({
        title: 'Checkout started',
        description: 'Follow the payment instructions to finish.',
        variant: 'success',
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Checkout failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async () => {
    if (!plan) return;
    if (status !== 'authenticated') return requireLogin();
    if (!selectedGateway) return;
    if (!senderNumber.trim() || !transactionId.trim()) {
      toast({
        title: 'Missing payment details',
        description: 'Enter your sender number and Transaction ID.',
        variant: 'error',
      });
      return;
    }
    setBusy(true);
    try {
      const isCreditsItem = plan.type === 'credits';
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isCreditsItem ? 'credits' : 'plan',
          planId: !isCreditsItem ? plan.id : undefined,
          packageId: isCreditsItem ? plan.id : undefined,
          currency: 'BDT',
          provider: selectedGateway.gatewayKey,
          senderNumber: senderNumber.trim(),
          transactionRef: transactionId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit payment');
      toast({
        title: 'Payment submitted',
        description: data.instructions || 'We will verify this payment and activate your service shortly.',
        variant: 'success',
      });
      onOpenChange(false);
      router.push('/dashboard/billing');
      router.refresh();
    } catch (e: any) {
      toast({ title: 'Submission failed', description: e.message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onSelectGateway = (gateway: PublicGateway) => {
    if (status !== 'authenticated') return requireLogin();
    if (!gateway.isEnabled) {
      toast({
        title: `${gateway.displayName} is not available yet`,
        description: 'Please choose another method or try again later.',
        variant: 'warning',
      });
      return;
    }
    setSelectedGateway(gateway);
    if (currency === 'USD' && !gateway.isManual) {
      void startInternational(gateway);
      return;
    }
    setStep('manual');
  };

  return {
    step,
    setStep,
    currency,
    setCurrency,
    selectedGateway,
    busy,
    senderNumber,
    setSenderNumber,
    transactionId,
    setTransactionId,
    formattedAmount,
    shownGateways,
    onSelectGateway,
    submitManual,
  };
}

