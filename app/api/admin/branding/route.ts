import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { ensureDatabaseSchema } from '@/lib/db-sync';
import { uploadFile, deleteFile, listFiles } from '@/lib/s3/client';

/**
 * Admin branding upload — POST /api/admin/branding (multipart/form-data).
 *
 * Accepts `kind` ('logo' | 'favicon') + `file`, validates the image, stores
 * it under a FIXED storage key (`branding/logo.<ext>` / `branding/favicon.<ext>`)
 * and points SiteSettings at the public serve route (/api/branding/<kind>),
 * so the admin uploads a file instead of pasting an external URL.
 *
 * Re-uploads delete the previous variant first, so at most ONE logo file and
 * ONE favicon file ever exist — branding storage never grows.
 *
 * SVG is stored as-is: uploads here are admin-only (requireApiAdmin), and the
 * serve route returns them with an image/svg+xml content type.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

type BrandingKind = 'logo' | 'favicon';

const RULES: Record<
  BrandingKind,
  { maxBytes: number; mimeByExt: Record<string, string>; label: string }
> = {
  logo: {
    maxBytes: 2 * 1024 * 1024,
    mimeByExt: {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    },
    label: 'PNG, JPG, WebP or SVG, up to 2 MB',
  },
  favicon: {
    maxBytes: 1 * 1024 * 1024,
    mimeByExt: {
      ico: 'image/x-icon',
      png: 'image/png',
      svg: 'image/svg+xml',
    },
    label: 'ICO, PNG or SVG, up to 1 MB',
  },
};

function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin(req);
    await ensureDatabaseSchema().catch(() => {});

    const form = await req.formData();
    const kindRaw = form.get('kind');
    const file = form.get('file');

    if (kindRaw !== 'logo' && kindRaw !== 'favicon') {
      return NextResponse.json(
        { error: 'invalid_kind', message: "Form field 'kind' must be 'logo' or 'favicon'." },
        { status: 400 },
      );
    }
    const kind = kindRaw as BrandingKind;
    const rules = RULES[kind];

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'file_required', message: 'No file was provided.' },
        { status: 400 },
      );
    }

    const ext = extOf(file.name);
    const mime = rules.mimeByExt[ext];
    if (!mime) {
      return NextResponse.json(
        {
          error: 'unsupported_format',
          message: `Unsupported file type ".${ext || '?'}". Supported: ${rules.label}.`,
        },
        { status: 400 },
      );
    }
    if (file.size > rules.maxBytes) {
      return NextResponse.json(
        {
          error: 'file_too_large',
          message: `File is too large. Supported: ${rules.label}.`,
        },
        { status: 400 },
      );
    }

    // Normalise jpeg → jpg so each kind+type maps to exactly one fixed key.
    const storedExt = ext === 'jpeg' ? 'jpg' : ext;
    const key = `branding/${kind}.${storedExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Delete any previous variant of this kind (possibly a different
    // extension) so re-uploads overwrite and never accumulate.
    try {
      const existing = await listFiles('branding/');
      await Promise.all(
        existing
          .map((f) => f.key)
          .filter((k) => k.startsWith(`branding/${kind}.`))
          .map((k) => deleteFile(k).catch(() => {})),
      );
    } catch {
      /* listing is best-effort; the upload below still lands on the fixed key */
    }

    await uploadFile(key, buffer, mime);

    // Point the site settings at the internal serve route. The ?v= timestamp
    // busts browser/CDN caches when the file is replaced.
    const url = `/api/branding/${kind}?v=${Date.now()}`;
    const field = kind === 'logo' ? 'logoUrl' : 'siteIconUrl';

    await prisma.siteSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', siteName: 'MetaCSV', [field]: url },
      update: { [field]: url, updatedAt: new Date() },
    });

    try {
      revalidateTag('site-settings');
    } catch {
      /* ignore in non-cache contexts */
    }
    try {
      revalidatePath('/', 'layout');
    } catch {
      /* ignore */
    }

    try {
      await prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'UPDATE',
          targetType: 'SiteSettings',
          targetId: 'default',
          after: { [field]: url },
        },
      });
    } catch {
      /* audit is best-effort */
    }

    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (e?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    console.error('branding upload failed', e);
    return NextResponse.json(
      { error: 'upload_failed', message: 'The upload failed. Please try again.' },
      { status: 500 },
    );
  }
}
