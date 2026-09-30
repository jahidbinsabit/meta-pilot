import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addCredits } from '@/lib/credits/engine';

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  try {
    const body = await req.json();
    const { ref, status, credits } = body;
    const order = await prisma.order.findFirst({
      where: { provider: params.provider, metadata: { path: ['ref'], equals: ref } as any },
    });
    if (!order) {
      return new Response(JSON.stringify({ error: 'order_not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (status === 'completed' && order.status !== 'PAID') {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
      await addCredits(
        order.userId,
        credits || Math.floor(order.amountCents / 100),
        `payment_${params.provider}`,
        { orderId: order.id },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
