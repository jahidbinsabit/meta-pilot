import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { ensureDatabaseSchema } from '@/lib/db-sync';
import { uploadFile, deleteFile, listFiles } from '@/lib/s3/client';
import { extOf } from '@/lib/utils';

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
 * SVG is stored as-is: uploads here are admin-only (requireApiAdmin), and
 * the serve route returns them with an image/svg+xml content type plus a
 * `Content-Security-Policy: sandbox` header.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * T4-62: content sniffing. Extension + size were the only checks, so any
 * bytes renamed to .png/.svg were stored and served as that image type.
 * Verify the magic bytes (or, for SVG, the document shape) match the
 * claimed extension before anything is stored.
 */
function contentMatchesExt(ext: string, buf: Buffer): boolean {
  switch (ext) {
    case 'png':
      return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'jpg':
    case 'jpeg':
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'webp':
      return (
        buf.length >= 12 &&
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'ico':
      return buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00;
    case 'svg': {
      const head = buf.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart();
      return head.startsWith('<') && /<svg[\s>]/i.test(head);
    }
    default:
      return false;
  }
}

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

    // Shared extOf returns the dotted form; branding rules key on the bare ext.
    const ext = extOf(file.name).slice(1);
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

    // T4-62: verify the bytes match the claimed type BEFORE the previous
    // variant is deleted or anything is stored.
    if (!contentMatchesExt(ext, buffer)) {
      return NextResponse.json(
        {
          error: 'content_mismatch',
          message: `The file's contents do not match its ".${ext}" extension. Supported: ${rules.label}.`,
        },
        { status: 400 },
      );
    }

    // Delete any previous variant of this kind (possibly a different
    // extension) so re-uploads overwrite and never accumulate.
    // A failed delete must NOT block the new upload (availability first),
    // but it is logged rather than swallowed silently (R7-03): the
    // leftover file is harmless because the serve route always picks the
    // NEWEST variant by lastModified.
    try {
      const existing = await listFiles('branding/');
      await Promise.all(
        existing
          .map((f) => f.key)
          .filter((k) => k.startsWith(`branding/${kind}.`))
          .map((k) =>
            deleteFile(k).catch((deleteErr) => {
              console.error(`[branding] failed to delete previous variant ${k}:`, deleteErr);
            }),
          ),
      );
    } catch (listErr) {
      console.error('[branding] could not list previous variants before upload:', listErr);
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
