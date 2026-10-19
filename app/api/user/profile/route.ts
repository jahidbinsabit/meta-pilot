import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { uploadImage, makeKey, publicUrl } from '@/lib/s3/client';
import { refreshSessionJWT } from '@/lib/auth-handler';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
// Validate by FILE EXTENSION, not the client-sent multipart `file.type`
// (attackers control that header). SVG is rejected outright — it can carry
// <script> and would execute in our origin when served inline.
const ALLOWED_AVATAR_EXTS = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
]);

/** GET /api/user/profile — current user's public profile data */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(req);
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        membership: true,
        credits: true,
        createdAt: true,
      },
    });
    return NextResponse.json(profile);
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED' || e?.message === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: e.message === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    console.error('profile fetch failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** PATCH /api/user/profile — update name and/or avatar */
export async function PATCH(req: Request) {
  try {
    const user = await requireApiUser(req);
    const contentType = req.headers.get('content-type') || '';

    let name: string | undefined;
    let imageUrl: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const nameVal = form.get('name');
      const avatarFile = form.get('avatar');

      if (typeof nameVal === 'string') {
        name = nameVal.trim() || undefined;
      }

      if (avatarFile instanceof File && avatarFile.size > 0) {
        // Extension-based check (client-sent MIME is attacker-controlled).
        const ext = avatarFile.name.split('.').pop()?.toLowerCase() || '';
        const safeMime = ALLOWED_AVATAR_EXTS.get(ext);
        if (!safeMime) {
          return NextResponse.json(
            { error: 'invalid_avatar_type', message: 'Avatar must be JPG, PNG, WebP, or GIF.' },
            { status: 400 },
          );
        }
        if (avatarFile.size > MAX_AVATAR_BYTES) {
          return NextResponse.json(
            { error: 'avatar_too_large', message: 'Avatar must be under 5MB.' },
            { status: 400 },
          );
        }
        const buffer = Buffer.from(await avatarFile.arrayBuffer());
        const key = makeKey(user.id, `avatar-${avatarFile.name}`);
        // Store with the validated safe MIME, not the client-sent file.type.
        await uploadImage(key, buffer, safeMime);
        imageUrl = publicUrl(key);
      }
    } else {
      // JSON body — name only, plus an avatar URL that must point at our own
      // upload storage (prevents arbitrary-URL avatars / XSS via javascript:).
      const body = await req.json();
      if (typeof body.name === 'string') {
        name = body.name.trim() || undefined;
      }
      if (typeof body.image === 'string' && body.image) {
        const candidate = body.image.trim();
        let ok = false;
        try {
          const parsed = new URL(candidate);
          ok =
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            (parsed.pathname.startsWith('/uploads/') ||
              parsed.pathname.startsWith('/api/s3/'));
        } catch {
          ok = false;
        }
        if (!ok) {
          return NextResponse.json({ error: 'invalid_avatar_url' }, { status: 400 });
        }
        imageUrl = candidate;
      }
    }

    const data: Record<string, any> = {};
    if (name !== undefined) data.name = name;
    if (imageUrl !== undefined) data.image = imageUrl;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        membership: true,
        credits: true,
      },
    });

    await refreshSessionJWT(req);

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error('profile update failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
