import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { listActivePresets } from '@/lib/prompt-styles/presets';

/** Active Prompt Style presets for the dashboard dropdown. */
export async function GET(req: Request) {
  try {
    await requireApiUser(req);
    const presets = await listActivePresets();
    // The dropdown only needs slug + label; the system instruction stays
    // server-side so a client can't read or override it directly.
    return NextResponse.json(presets.map((p) => ({ id: p.id, slug: p.slug, label: p.label })));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unauthorized' }, { status: 401 });
  }
}
