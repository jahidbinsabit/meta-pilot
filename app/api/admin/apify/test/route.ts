import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { ApifyClient } from 'apify-client';
import { getApifyConfig } from '@/lib/adobe-analytics/apify-stock';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await requireApiAdmin(req);
    const body = await req.json().catch(() => ({}));
    let token: string = body.token?.trim() || '';
    let actorId: string = body.actorId?.trim() || '';

    // M4: the settings form only ever holds the masked preview (••••last4),
    // never the raw token. A masked or empty token means "test the saved
    // configuration" — resolve the real token server-side with the same
    // SiteSettings/env precedence the runtime uses.
    if (!token || token.startsWith('••••')) {
      const config = await getApifyConfig().catch(() => null);
      token = config?.token?.trim() || '';
      if (!actorId && config?.actorId) actorId = config.actorId;
    }
    if (!actorId) actorId = 'Ea82wcTpNYzTRV7A3';

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