import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { deletePreset, listAllPresets, upsertPreset } from '@/lib/prompt-styles/presets';

/** Admin CRUD for the Image → Prompt style presets. */

export async function GET(req: Request) {
  try {
    await requireApiAdmin(req);
    return NextResponse.json(await listAllPresets());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'forbidden' }, { status: 403 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin(req);
    const body = await req.json();
    const { id, slug, label, systemInstruction, sortOrder, isActive } = body || {};
    if (!slug) {
      return NextResponse.json({ error: 'slug_required' }, { status: 400 });
    }
    const preset = await upsertPreset(
      {
        slug: String(slug).trim().toLowerCase(),
        label: label ? String(label) : undefined,
        systemInstruction: systemInstruction ? String(systemInstruction) : undefined,
        sortOrder: typeof sortOrder === 'number' ? Math.floor(sortOrder) : undefined,
        isActive: typeof isActive === 'boolean' ? isActive : undefined,
      },
      admin.id,
    );
    return NextResponse.json(preset);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'save_failed' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireApiAdmin(req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id_required' }, { status: 400 });
    }
    await deletePreset(id, admin.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'delete_failed' }, { status: 400 });
  }
}
