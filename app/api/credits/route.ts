import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getBalance } from '@/lib/credits/engine';

export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ credits: await getBalance(user.id) });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
