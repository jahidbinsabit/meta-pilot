import Stripe from 'stripe';
import { getStripeCredentials } from '@/lib/payments/config';

export async function getStripe() {
  const creds = await getStripeCredentials();
  const key = creds.secretKey;
  if (!key) throw new Error('stripe_not_configured');
  return new (Stripe as any)(key, {
    apiVersion: '2024-04-10' as any,
  });
}

