export type NotificationAudience = 'ALL' | 'FREE' | 'PRO' | 'PLUS' | 'AGENCY' | 'ENTERPRISE';

const AUDIENCES: readonly string[] = ['ALL', 'FREE', 'PRO', 'PLUS', 'AGENCY', 'ENTERPRISE'];

/**
 * Normalize an untrusted audience value to a valid NotificationAudience.
 * ENTERPRISE is a real audience (schema + dashboard consumer support it) —
 * omitting it silently widens those notifications to ALL users.
 */
export function normalizeAudience(value: unknown): NotificationAudience {
  const normalized = String(value || 'ALL').toUpperCase();
  if (AUDIENCES.includes(normalized)) {
    return normalized as NotificationAudience;
  }
  return 'ALL';
}
