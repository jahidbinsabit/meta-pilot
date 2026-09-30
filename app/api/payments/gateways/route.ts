import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildCheckoutGateways } from '@/lib/payments/public';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const gateways = await prisma.paymentGatewayConfig.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    const publicGateways = buildCheckoutGateways(gateways);
    return NextResponse.json({ gateways: publicGateways });
  } catch (e: any) {
    console.error('Failed to fetch gateways:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
