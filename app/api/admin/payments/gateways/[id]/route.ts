import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { deleteGatewayConfig, saveGatewayConfig } from '@/lib/payments/config';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireApiAdmin();
    const body = await req.json();

    const existing = await prisma.paymentGatewayConfig.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'gateway_not_found' }, { status: 404 });
    }

    const { displayName, isEnabled, isManual, sortOrder, credentials } = body;

    const gateway = await saveGatewayConfig(
      {
        id: existing.id,
        gatewayKey: existing.gatewayKey,
        displayName: displayName || existing.displayName,
        isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : existing.isEnabled,
        isManual: isManual !== undefined ? Boolean(isManual) : existing.isManual,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder,
        credentials: credentials !== undefined ? credentials : undefined,
      },
      admin.id,
    );

    return NextResponse.json({ ok: true, gateway });
  } catch (error: any) {
    console.error('Admin update gateway error:', error);
    const status = error.message === 'FORBIDDEN' ? 403 : error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: error.message || 'internal_error' }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return PUT(req, { params });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireApiAdmin();
    const result = await deleteGatewayConfig(params.id, admin.id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Admin delete gateway error:', error);
    const status = error.message === 'FORBIDDEN' ? 403 : error.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: error.message || 'internal_error' }, { status });
  }
}
