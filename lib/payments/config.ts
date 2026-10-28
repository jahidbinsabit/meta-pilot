import { prisma } from '@/lib/db';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { writeAudit } from '@/lib/audit';
import { fulfillPayment } from '@/lib/payments/fulfill';
import { createId } from '@/lib/id';
import type { PaymentGatewayConfig, PaymentMethod } from '@prisma/client';

export { decryptSecret, encryptSecret };

export interface DecryptedGatewayConfig {
  id: string;
  gatewayKey: string;
  displayName: string;
  isEnabled: boolean;
  isManual: boolean;
  sortOrder: number;
  credentials: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mask credential values for admin list display — show only the last 4
 * chars so secrets never leave the server in full. Empty values stay empty
 * (so the UI can distinguish "not set" from "set").
 */
export function maskCredentials(creds: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v === 'string' && v.length > 0) {
      out[k] = v.length <= 4 ? '••••' : `••••${v.slice(-4)}`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

const MASK_PREFIX = '••••';

function isMaskedCredentialValue(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(MASK_PREFIX);
}

/**
 * T4-31: the admin UI only ever holds MASKED credential values (••••last4),
 * and the gateway form submits the whole credentials object. A masked value
 * in a save therefore means "unchanged" — substitute the currently stored
 * value for that key. If nothing is stored for the key, drop it rather than
 * persisting the mask itself as the secret (which silently destroyed live
 * Stripe/bKash credentials on the second save of a session).
 */
function resolveMaskedCredentials(
  incoming: Record<string, any>,
  stored: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (isMaskedCredentialValue(v)) {
      if (stored[k] !== undefined) out[k] = stored[k];
      // No stored value → drop the key instead of storing the mask.
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function parseGatewayCredentials(raw: unknown): Record<string, any> {
  if (!raw) return {};
  try {
    let value = raw;
    if (typeof value === 'string') {
      try {
        const decrypted = decryptSecret(value);
        value = decrypted.startsWith('{') ? JSON.parse(decrypted) : decrypted;
      } catch {
        // Not an encrypted blob — try the raw string as plain JSON
        // (backwards compat with pre-encryption stored credentials).
        value = raw;
      }
    }
    if (typeof value === 'string' && value.startsWith('{')) {
      value = JSON.parse(value);
    }
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  } catch {
    return {};
  }
}

export async function listGatewayConfigsAdmin(): Promise<DecryptedGatewayConfig[]> {
  const gateways = await prisma.paymentGatewayConfig.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return gateways.map((g) => ({
    id: g.id,
    gatewayKey: g.gatewayKey,
    displayName: g.displayName,
    isEnabled: g.isEnabled,
    isManual: g.isManual,
    sortOrder: g.sortOrder,
    credentials: parseGatewayCredentials(g.credentialsJson),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));
}

export async function getGatewayConfig(gatewayKey: string): Promise<DecryptedGatewayConfig | null> {
  const g = await prisma.paymentGatewayConfig.findUnique({
    where: { gatewayKey },
  });
  if (!g) return null;

  return {
    id: g.id,
    gatewayKey: g.gatewayKey,
    displayName: g.displayName,
    isEnabled: g.isEnabled,
    isManual: g.isManual,
    sortOrder: g.sortOrder,
    credentials: parseGatewayCredentials(g.credentialsJson),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export async function getStripeCredentials() {
  const stripeConfig = await getGatewayConfig('stripe');
  const creds = stripeConfig?.credentials || {};

  const secretKey = (creds.secretKey as string) || process.env.STRIPE_SECRET_KEY || '';
  const publishableKey =
    (creds.publishableKey as string) || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const webhookSecret =
    (creds.webhookSecret as string) || process.env.STRIPE_WEBHOOK_SECRET || '';

  return { secretKey, publishableKey, webhookSecret };
}

export interface SaveGatewayInput {
  id?: string;
  gatewayKey: string;
  displayName: string;
  isEnabled?: boolean;
  isManual?: boolean;
  sortOrder?: number;
  credentials?: Record<string, any>;
}

export async function saveGatewayConfig(input: SaveGatewayInput, adminId: string) {
  const { gatewayKey, displayName, isEnabled, isManual, sortOrder, credentials } = input;

  const before = await prisma.paymentGatewayConfig.findUnique({
    where: { gatewayKey },
  });

  // The client submits the whole credentials object and only ever holds
  // masked values — resolve any masked entry back to the stored secret
  // before encrypting, so a re-save can never overwrite a real credential
  // with its ••••last4 placeholder.
  const resolvedCredentials = credentials
    ? resolveMaskedCredentials(
        credentials,
        before ? parseGatewayCredentials(before.credentialsJson) : {},
      )
    : undefined;

  const credentialsJson = resolvedCredentials
    ? encryptSecret(JSON.stringify(resolvedCredentials))
    : undefined;

  const result = await prisma.paymentGatewayConfig.upsert({
    where: { gatewayKey },
    create: {
      id: input.id || createId(),
      gatewayKey,
      displayName,
      isEnabled: isEnabled ?? false,
      isManual: isManual ?? false,
      sortOrder: sortOrder ?? 0,
      credentialsJson: credentialsJson || encryptSecret('{}'),
      updatedAt: new Date(),
    },
    update: {
      displayName: displayName ?? undefined,
      isEnabled: isEnabled !== undefined ? isEnabled : undefined,
      isManual: isManual !== undefined ? isManual : undefined,
      sortOrder: sortOrder !== undefined ? sortOrder : undefined,
      credentialsJson: credentialsJson ?? undefined,
      updatedAt: new Date(),
    },
  });

  try {
    await writeAudit({
      adminId,
      action: before ? 'payment_gateway_updated' : 'payment_gateway_created',
      targetType: 'PaymentGatewayConfig',
      targetId: result.id,
      before: before ? { ...before, credentialsJson: '[REDACTED]' } : undefined,
      after: { ...result, credentialsJson: '[REDACTED]' },
    });
  } catch (e) {
    console.error('[audit] payment gateway audit write failed:', e);
  }

  return {
    id: result.id,
    gatewayKey: result.gatewayKey,
    displayName: result.displayName,
    isEnabled: result.isEnabled,
    isManual: result.isManual,
    sortOrder: result.sortOrder,
    credentials: parseGatewayCredentials(result.credentialsJson),
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export async function deleteGatewayConfig(id: string, adminId: string) {
  const before = await prisma.paymentGatewayConfig.findUnique({ where: { id } });
  if (!before) throw new Error('gateway_not_found');

  await prisma.paymentGatewayConfig.delete({ where: { id } });

  try {
    await writeAudit({
      adminId,
      action: 'payment_gateway_deleted',
      targetType: 'PaymentGatewayConfig',
      targetId: id,
      before: { ...before, credentialsJson: '[REDACTED]' },
    });
  } catch (e) {
    console.error('[audit] payment gateway deletion audit failed:', e);
  }

  return { ok: true };
}

export interface AdminManualPaymentInput {
  userId: string;
  type: 'plan' | 'credits';
  planId?: string;
  packageId?: string;
  credits?: number;
  amountBDT?: number;
  amountUSD?: number;
  method?: string;
  transactionRef?: string;
  senderNumber?: string;
  notes?: string;
  autoApprove?: boolean;
}

export async function createManualPaymentAdmin(input: AdminManualPaymentInput, adminId: string) {
  const {
    userId,
    type,
    planId,
    packageId,
    credits,
    amountBDT = 0,
    amountUSD = 0,
    method = 'BKASH_MANUAL',
    transactionRef = `ADMIN-${createId().substring(0, 8).toUpperCase()}`,
    senderNumber = 'ADMIN_MANUAL',
    notes = 'Manual payment added by admin',
    autoApprove = true,
  } = input;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('user_not_found');

  let normalizedMethod: PaymentMethod = 'OTHER_GATEWAY';
  const methodUpper = method.toUpperCase();
  if (methodUpper.includes('BKASH')) normalizedMethod = 'BKASH_MANUAL';
  else if (methodUpper.includes('NAGAD')) normalizedMethod = 'NAGAD_MANUAL';
  else if (methodUpper.includes('STRIPE')) normalizedMethod = 'STRIPE';

  let payload: Record<string, any> = {
    type,
    senderNumber,
    notes,
    createdByAdminId: adminId,
  };

  // T4-34: validate that this payment will actually fulfill something
  // BEFORE the row is created. Previously a plan payment with no planId
  // (or a credits payment resolving to 0 credits) fell through to a
  // credits: 0 payload and — with autoApprove — ended COMPLETED with
  // nothing granted and no warning.
  if (type === 'plan') {
    if (!planId) throw new Error('plan_id_required');
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('plan_not_found');
    payload = {
      ...payload,
      planId,
      planName: plan.name,
      credits: plan.creditsIncluded,
    };
  } else if (packageId) {
    const pkg = await prisma.creditPackage.findUnique({ where: { id: packageId } });
    if (!pkg) throw new Error('package_not_found');
    const resolvedCredits = pkg.credits || credits || 0;
    if (resolvedCredits <= 0) throw new Error('nothing_to_fulfill');
    payload = {
      ...payload,
      packageId,
      packageName: pkg.name,
      credits: resolvedCredits,
    };
  } else {
    const resolvedCredits = credits || 0;
    if (resolvedCredits <= 0) throw new Error('nothing_to_fulfill');
    payload = {
      ...payload,
      credits: resolvedCredits,
    };
  }

  const payment = await prisma.payment.create({
    data: {
      id: createId(),
      userId,
      method: normalizedMethod,
      amountBDT: Math.round(amountBDT),
      amountUSD: Number(amountUSD),
      status: 'PENDING',
      transactionRef,
      planIdOrCreditPackageId: planId || packageId || null,
      gatewayPayload: payload as any,
      reviewedByAdminId: autoApprove ? adminId : null,
      updatedAt: new Date(),
    },
  });

  if (autoApprove) {
    const fulfillment = await fulfillPayment(payment.id);
    if (!fulfillment.ok) {
      // Never report success for a payment that granted nothing — the row
      // stays PENDING and the admin sees the reason.
      throw new Error(fulfillment.error);
    }
  }

  try {
    await writeAudit({
      adminId,
      action: 'admin_manual_payment_created',
      targetType: 'Payment',
      targetId: payment.id,
      after: {
        userId,
        amountBDT,
        amountUSD,
        method: normalizedMethod,
        transactionRef,
        autoApprove,
        payload,
      },
    });
  } catch (e) {
    console.error('[audit] manual payment audit write failed:', e);
  }

  return prisma.payment.findUnique({
    where: { id: payment.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

