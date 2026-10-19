/**
 * Ownership check for user-scoped storage keys.
 *
 * Uploads and generated previews are namespaced as
 * `uploads-<userId>-…` / `previews-<userId>-…`. A key belongs to the user
 * only when it starts with one of their prefixes. This is the ownership
 * proof used before downloadFile / serving / deleting.
 */
export function ownsStorageKey(userId: string, key: string): boolean {
  if (!userId || !key) return false;
  return (
    key.startsWith(`uploads-${userId}-`) ||
    key.startsWith(`previews-${userId}-`)
  );
}
