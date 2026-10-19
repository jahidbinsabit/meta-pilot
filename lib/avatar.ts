/**
 * Normalize a stored avatar URL for display.
 * Legacy rows may store bare filenames like `uploads-<userId>-...jpg`
 * (missing the `/uploads/` prefix) — those 404 as relative URLs.
 */
export function resolveAvatarUrl(image: string | null | undefined): string | null {
  if (!image) return null;
  const url = image.trim();
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
    return url;
  }
  // Bare storage key (e.g. `uploads-<userId>-...jpg`) → local uploads route.
  return `/uploads/${url}`;
}
