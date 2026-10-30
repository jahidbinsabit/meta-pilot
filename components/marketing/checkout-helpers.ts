import { CreditCard, Smartphone, Wallet } from 'lucide-react';
import type { CheckoutCurrency, PublicGateway } from '@/lib/payments/public';

export type { CheckoutCurrency };

export type CheckoutPlan = {
  id: string;
  name: string;
  type?: 'plan' | 'credits';
  tier?: string;
  monthlyPriceUSD?: number;
  monthlyPriceBDT?: number;
  priceUSD?: number;
  priceBDT?: number;
  creditsIncluded?: number;
  dailyFreeCredits?: number;
  credits?: number;
  description?: string;
  preSelectedCurrency?: CheckoutCurrency;
};

export type CheckoutStep = 'currency' | 'gateway' | 'manual';

export function gatewayIcon(gatewayKey: string) {
  const key = gatewayKey.toLowerCase();
  if (key.includes('bkash') || key.includes('nagad')) return Smartphone;
  if (key.includes('stripe')) return CreditCard;
  return Wallet;
}

export function gatewaysForCurrency(gateways: PublicGateway[], currency: CheckoutCurrency) {
  const enabled = gateways.filter((g) => g.currency === currency && g.isEnabled);
  if (enabled.length > 0) return enabled;
  return gateways.filter((g) => g.currency === currency);
}

export function planAmount(plan: CheckoutPlan, currency: CheckoutCurrency) {
  if (plan.type === 'credits') {
    return currency === 'USD' ? (plan.priceUSD ?? 0) : (plan.priceBDT ?? 0);
  }
  return currency === 'USD' ? (plan.monthlyPriceUSD ?? 0) : (plan.monthlyPriceBDT ?? 0);
}

