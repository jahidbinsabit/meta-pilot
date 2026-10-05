import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { uploadImage, makeKey, publicUrl } from '@/lib/s3/client';
import { refreshSessionJWT } from '@/lib/auth-handler';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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
    return NextResponse.json({ error: e.message || 'unauthorized' }, { status: 401 });
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
        if (!ALLOWED_AVATAR_TYPES.has(avatarFile.type)) {
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
        await uploadImage(key, buffer, avatarFile.type);
        imageUrl = publicUrl(key);
      }
    } else {
      // JSON body — name only
      const body = await req.json();
      if (typeof body.name === 'string') {
        name = body.name.trim() || undefined;
      }
      if (typeof body.image === 'string') {
        imageUrl = body.image || undefined;
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
    return NextResponse.json({ error: e.message || 'update_failed' }, { status: 500 });
  }
}
