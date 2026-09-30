import { decryptSecret } from '@/lib/crypto';
import type { PaymentGatewayConfig } from '@prisma/client';

export type CheckoutCurrency = 'USD' | 'BDT';

export type PublicGateway = {
  gatewayKey: string;
  displayName: string;
  isEnabled: boolean;
  isManual: boolean;
  currency: CheckoutCurrency;
  receivingNumber: string | null;
  accountType?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  instructions: string | null;
};

const BDT_HINTS = ['bkash', 'nagad', 'rocket', 'upay', 'sslcommerz', 'shurjopay', 'bank'];

const USD_DEFAULTS: PublicGateway[] = [
  {
    gatewayKey: 'stripe',
    displayName: 'Stripe',
    isEnabled: false,
    isManual: false,
    currency: 'USD',
    receivingNumber: null,
    accountType: null,
    instructions: 'Pay securely with Visa, Mastercard, Amex, or other international cards.',
  },
];

const BDT_DEFAULTS: PublicGateway[] = [
  {
    gatewayKey: 'bkash_manual',
    displayName: 'bKash',
    isEnabled: false,
    isManual: true,
    currency: 'BDT',
    receivingNumber: null,
    accountType: 'Merchant',
    instructions: 'Send the exact amount to our bKash number, then submit your sender number and Transaction ID.',
  },
  {
    gatewayKey: 'nagad_manual',
    displayName: 'Nagad',
    isEnabled: false,
    isManual: true,
    currency: 'BDT',
    receivingNumber: null,
    accountType: 'Merchant',
    instructions: 'Send the exact amount to our Nagad number, then submit your sender number and Transaction ID.',
  },
];

export function gatewayCurrency(gatewayKey: string, customCurrency?: string): CheckoutCurrency {
  if (customCurrency === 'USD' || customCurrency === 'BDT') return customCurrency;
  const key = gatewayKey.toLowerCase();
  return BDT_HINTS.some((hint) => key.includes(hint)) ? 'BDT' : 'USD';
}

function parseCredentials(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  try {
    let value = raw;
    if (typeof value === 'string') {
      const decrypted = decryptSecret(value);
      value = decrypted.startsWith('{') ? JSON.parse(decrypted) : decrypted;
    }
    if (typeof value === 'string' && value.startsWith('{')) {
      value = JSON.parse(value);
    }
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function toPublicGateway(gateway: PaymentGatewayConfig): PublicGateway {
  const creds = parseCredentials(gateway.credentialsJson);
  const receiving =
    (typeof creds.receivingNumber === 'string' && creds.receivingNumber) ||
    (typeof creds.merchantNumber === 'string' && creds.merchantNumber) ||
    (typeof creds.accountNumber === 'string' && creds.accountNumber) ||
    (typeof creds.username === 'string' && creds.username) ||
    null;
  const instructions =
    (typeof creds.instructions === 'string' && creds.instructions) ||
    (typeof creds.note === 'string' && creds.note) ||
    null;
  const accountType =
    (typeof creds.accountType === 'string' && creds.accountType) || null;
  const bankName =
    (typeof creds.bankName === 'string' && creds.bankName) || null;
  const accountName =
    (typeof creds.accountName === 'string' && creds.accountName) || null;
  const currency = gatewayCurrency(
    gateway.gatewayKey,
    typeof creds.currency === 'string' ? creds.currency : undefined,
  );

  return {
    gatewayKey: gateway.gatewayKey,
    displayName: gateway.displayName,
    isEnabled: gateway.isEnabled,
    isManual: gateway.isManual,
    currency,
    receivingNumber: receiving,
    accountType,
    bankName,
    accountName,
    instructions,
  };
}

export function buildCheckoutGateways(dbGateways: PaymentGatewayConfig[]): PublicGateway[] {
  const fromDb = dbGateways.map(toPublicGateway);
  const byKey = new Map(fromDb.map((g) => [g.gatewayKey, g]));

  const merge = (defaults: PublicGateway[]) =>
    defaults.map((fallback) => {
      const match =
        byKey.get(fallback.gatewayKey) ||
        fromDb.find(
          (g) =>
            g.currency === fallback.currency &&
            (g.gatewayKey.includes(fallback.gatewayKey.split('_')[0]) ||
              fallback.gatewayKey.includes(g.gatewayKey.split('_')[0])),
        );
      if (!match) return fallback;
      byKey.delete(match.gatewayKey);
      return {
        ...fallback,
        ...match,
        instructions: match.instructions || fallback.instructions,
      };
    });

  const usd = merge(USD_DEFAULTS);
  const bdt = merge(BDT_DEFAULTS);
  const extras = [...byKey.values()].filter(
    (g) =>
      !usd.some((u) => u.gatewayKey === g.gatewayKey) &&
      !bdt.some((b) => b.gatewayKey === g.gatewayKey),
  );

  return [...usd, ...bdt, ...extras].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function formatCheckoutAmount(currency: CheckoutCurrency, amount: number) {
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `৳${Math.round(amount).toLocaleString('en-US')}`;
}

export function paymentMethodFromGateway(gatewayKey: string) {
  const key = gatewayKey.toLowerCase();
  if (key.includes('bkash')) return 'BKASH_MANUAL' as const;
  if (key.includes('nagad')) return 'NAGAD_MANUAL' as const;
  if (key.includes('stripe')) return 'STRIPE' as const;
  return 'OTHER_GATEWAY' as const;
}

export function providerFromGateway(gatewayKey: string) {
  const key = gatewayKey.toLowerCase();
  if (key.includes('bkash')) return 'bkash';
  if (key.includes('nagad')) return 'nagad';
  if (key.includes('stripe')) return 'stripe';
  return key.split('_')[0];
}

