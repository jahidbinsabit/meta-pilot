import { describe, it, expect } from 'vitest';
import { isMembershipExpired } from '@/lib/plans/membership';

// B9-01: the pure expiry predicate behind getActiveMembership, the
// billing page flag and (in bulk form) the cleanup cron sweep.
describe('isMembershipExpired', () => {
  const now = new Date('2026-10-29T12:00:00.000Z');

  it('null renewsAt is never expired (no expiry instant set)', () => {
    expect(isMembershipExpired({ renewsAt: null }, now)).toBe(false);
  });

  it('undefined renewsAt is never expired', () => {
    expect(isMembershipExpired({ renewsAt: undefined }, now)).toBe(false);
  });

  it('a past renewsAt is expired', () => {
    expect(
      isMembershipExpired({ renewsAt: new Date('2026-10-29T11:59:59.000Z') }, now),
    ).toBe(true);
  });

  it('a future renewsAt is not expired', () => {
    expect(
      isMembershipExpired({ renewsAt: new Date('2026-10-29T12:00:01.000Z') }, now),
    ).toBe(false);
  });

  it('renewsAt exactly at now counts as expired (<= boundary)', () => {
    expect(isMembershipExpired({ renewsAt: new Date(now.getTime()) }, now)).toBe(true);
  });

  it('defaults to the current time when now is omitted', () => {
    expect(isMembershipExpired({ renewsAt: new Date('2000-01-01T00:00:00.000Z') })).toBe(
      true,
    );
    expect(isMembershipExpired({ renewsAt: new Date('2100-01-01T00:00:00.000Z') })).toBe(
      false,
    );
  });
});
