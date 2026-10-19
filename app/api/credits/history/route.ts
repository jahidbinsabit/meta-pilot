import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getCreditHistory } from '@/lib/credits/engine';

export async function GET() {
  try {
    const user = await requireApiUser();
    const history = await getCreditHistory(user.id, 50);
    return NextResponse.json(history);
  } catch (e: any) {
    console.error('credit history fetch failed', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
