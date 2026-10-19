import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { getBalance } from '@/lib/credits/engine';
import { getSiteSettings } from '@/lib/site-settings';

export async function GET() {
  try {
    const user = await requireApiUser();
    const settings = await getSiteSettings().catch(() => null);
    const unlimited = settings?.unlimitedMode === true;
    return NextResponse.json({
      credits: await getBalance(user.id),
      unlimited,
    });
  } catch (e: any) {
    console.error('credits fetch failed', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
