import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { saveGatewayConfig, maskCredentials } from '@/lib/payments/config';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin();
    const body = await req.json();
    const { gatewayKey, displayName, isEnabled, isManual, sortOrder, credentials } = body;

    if (!gatewayKey || !displayName) {
      return NextResponse.json(
        { error: 'gateway_key_and_display_name_required' },
        { status: 400 },
      );
    }

    // T4-46: this is the CREATE path — saveGatewayConfig upserts by
    // gatewayKey, so creating with an existing key silently overwrote the
    // existing gateway's config (and the client added a duplicate row).
    // Reject duplicates here; edits go through the [id] route.
    const normalizedKey = String(gatewayKey).trim().toLowerCase();
    const existing = await prisma.paymentGatewayConfig.findUnique({
      where: { gatewayKey: normalizedKey },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'gateway_key_exists',
          message: `A gateway with key "${normalizedKey}" already exists — edit it instead of creating a new one.`,
        },
        { status: 409 },
      );
    }

    const gateway = await saveGatewayConfig(
      {
        gatewayKey: normalizedKey,
        displayName: String(displayName).trim(),
        isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : undefined,
        isManual: isManual !== undefined ? Boolean(isManual) : undefined,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
        credentials: credentials || {},
      },
      admin.id,
    );

    // M5: saveGatewayConfig returns DECRYPTED credentials — mask them in
    // the response exactly like GET does, so full payment secrets never
    // leave the server on a save.
    return NextResponse.json({
      ok: true,
      gateway: { ...gateway, credentials: maskCredentials(gateway.credentials) },
    });
  } catch (error: any) {
    console.error('Admin save gateway error:', error);
    const status = error.message === 'FORBIDDEN' ? 403 : error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: error.message || 'internal_error' }, { status });
  }
}
