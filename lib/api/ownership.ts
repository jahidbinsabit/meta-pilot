/**
 * Ownership check for user-scoped storage keys.
 *
 * Real key formats in this codebase (the previous version of this helper
 * was written against an imagined `uploads-<userId>-…` dash format that
 * nothing produces, which made every ownership check fail with 403):
 *   - uploads:  `uploads/<userId>/<timestamp>-<slug>`   (lib/s3/client makeKey)
 *   - previews: `previews/<userId>/<timestamp>-<hex>-<name>` (lib/generator/images storePreview)
 *
 * The check mirrors the /api/s3 route: normalize `.`/`..` segments first
 * (so `uploads/<me>/../../<other>/x` cannot sneak past), then require
 * segment[0] to be the namespace and segment[1] to be exactly the user id.
 */
export function ownsStorageKey(userId: string, key: string): boolean {
  if (!userId || !key) return false;

  const out: string[] = [];
  for (const seg of key.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      // Climbing past the root is always an escape attempt.
      if (out.length === 0) return false;
      out.pop();
      continue;
    }
    out.push(seg);
  }

  return (
    out.length >= 3 &&
    (out[0] === 'uploads' || out[0] === 'previews') &&
    out[1] === userId
  );
}
