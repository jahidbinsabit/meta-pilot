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

// ---------------------------------------------------------------------------
// T1-18: a checkout started while logged out used to lose the chosen
// plan across the login redirect — the selection lived only in
// component state on a page the login round-trip unmounts. Persist the
// selection's identity (id + kind + currency) in sessionStorage before
// redirecting; the page the user lands back on re-opens the dialog on
// the same item and consumes the entry.
// ---------------------------------------------------------------------------

const PENDING_CHECKOUT_KEY = 'sf-pending-checkout';

export interface PendingCheckout {
  id: string;
  type: 'plan' | 'credits';
  currency: CheckoutCurrency;
}

export function savePendingCheckout(plan: CheckoutPlan, currency: CheckoutCurrency): void {
  try {
    const pending: PendingCheckout = {
      id: plan.id,
      type: plan.type === 'credits' ? 'credits' : 'plan',
      currency,
    };
    sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(pending));
  } catch {
    // storage unavailable — the user just re-picks after login
  }
}

/** Read AND remove the stored selection; null when absent or malformed. */
export function takePendingCheckout(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingCheckout>;
    if (
      typeof parsed.id === 'string' &&
      (parsed.type === 'plan' || parsed.type === 'credits') &&
      (parsed.currency === 'USD' || parsed.currency === 'BDT')
    ) {
      return parsed as PendingCheckout;
    }
  } catch {
    // malformed entry — treat as none
  }
  return null;
}

