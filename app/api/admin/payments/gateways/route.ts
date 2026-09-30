import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { listGatewayConfigsAdmin, saveGatewayConfig } from '@/lib/payments/config';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireApiAdmin();
    const gateways = await listGatewayConfigsAdmin();
    return NextResponse.json({ gateways });
  } catch (error: any) {
    console.error('Admin get gateways error:', error);
    const status = error.message === 'FORBIDDEN' ? 403 : error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: error.message || 'internal_error' }, { status });
  }
}

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

    const gateway = await saveGatewayConfig(
      {
        gatewayKey: String(gatewayKey).trim().toLowerCase(),
        displayName: String(displayName).trim(),
        isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : undefined,
        isManual: isManual !== undefined ? Boolean(isManual) : undefined,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
        credentials: credentials || {},
      },
      admin.id,
    );

    return NextResponse.json({ ok: true, gateway });
  } catch (error: any) {
    console.error('Admin save gateway error:', error);
    const status = error.message === 'FORBIDDEN' ? 403 : error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: error.message || 'internal_error' }, { status });
  }
}
