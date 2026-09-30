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

export function parseGatewayCredentials(raw: unknown): Record<string, any> {
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

  const credentialsJson = credentials ? encryptSecret(JSON.stringify(credentials)) : undefined;

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

  if (type === 'plan' && planId) {
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
    payload = {
      ...payload,
      packageId,
      packageName: pkg?.name,
      credits: pkg?.credits || credits || 0,
    };
  } else {
    payload = {
      ...payload,
      credits: credits || 0,
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
    await fulfillPayment(payment.id);
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

