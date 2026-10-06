import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { ApifyClient } from 'apify-client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await requireApiAdmin(req);
    const body = await req.json().catch(() => ({}));
    const token = body.token?.trim();
    const actorId = body.actorId?.trim() || 'Ea82wcTpNYzTRV7A3';

    if (!token) {
      return NextResponse.json({ ok: false, error: 'Apify API token is required' }, { status: 400 });
    }

    const client = new ApifyClient({ token });
    // Verify user/token validity
    const user = await client.user().get();
    
    // Check actor access
    const actor = await client.actor(actorId).get().catch(() => null);

    if (!actor) {
      return NextResponse.json({
        ok: false,
        error: `Connected to account "${user?.username || user?.id}", but Actor ID "${actorId}" was not found on Apify. Use default Actor ID "Ea82wcTpNYzTRV7A3" (or "igolaizola/adobe-stock-scraper").`,
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      username: user?.username || user?.id,
      actorFound: true,
      actorName: actor?.name || actorId,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || 'Failed to authenticate with Apify',
    }, { status: 400 });
  }
}