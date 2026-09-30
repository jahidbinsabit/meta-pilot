import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getCreditHistory } from '@/lib/credits/engine';

export async function GET() {
  try {
    const user = await requireApiUser();
    const history = await getCreditHistory(user.id, 50);
    return NextResponse.json(history);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
