/**
 * Pure path/key predicates for the AI adapters' image resolution
 * (audit R9, S9-02). Kept dependency-free so they are unit-testable and
 * so the adapter-side resolver can be safe regardless of caller: a
 * reference is only ever resolved when it provably stays inside the
 * caller's own storage namespace or the local uploads directory.
 */

import path from 'path';

/**
 * Resolve `filename` against the local uploads directory and return the
 * absolute path ONLY when the result stays strictly inside that
 * directory. `..` escapes (e.g. `../../etc/passwd`, encoded or not —
 * callers decode first) return null. The uploads root itself is not a
 * file, so it returns null too.
 */
export function resolveLocalUploadPath(
  filename: string,
  uploadsDir: string = path.join(process.cwd(), 'public', 'uploads'),
): string | null {
  if (!filename) return null;
  const root = path.resolve(uploadsDir);
  const resolved = path.resolve(root, filename);
  if (resolved === root) return null;
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/**
 * Validate a raw storage key as an image object owned by `userId` and
 * return its canonical (`.`/`..`-normalized) form, or null. Only the
 * `uploads/` and `previews/` namespaces qualify — adapters resolve
 * generation inputs, and those are the only namespaces generation ever
 * writes. Normalization happens BEFORE the namespace/owner judgement,
 * mirroring `ownsStorageKey`, so `uploads/<me>/../../<other>/x` cannot
 * sneak past. A missing userId never validates.
 */
export function ownedImageKey(userId: string | undefined, key: string): string | null {
  if (!userId || !key) return null;

  const out: string[] = [];
  for (const seg of key.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      // Climbing past the root is always an escape attempt.
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }

  if (
    out.length >= 3 &&
    (out[0] === 'uploads' || out[0] === 'previews') &&
    out[1] === userId
  ) {
    return out.join('/');
  }
  return null;
}
