import { describe, it, expect } from 'vitest';
import { isDisposableEmailDomain } from '@/lib/email/disposable';
import { ownedImageKey, resolveLocalUploadPath } from '@/lib/ai/image-ref';

/**
 * R9 S9-03 / S9-02 pure helpers: the disposable-email matcher used by
 * registration, and the path/key predicates that make the Gemini
 * adapter's image resolver safe regardless of caller.
 */

describe('isDisposableEmailDomain', () => {
  it('matches blocklisted domains in full addresses', () => {
    expect(isDisposableEmailDomain('user@mailinator.com')).toBe(true);
    expect(isDisposableEmailDomain('user@tempmail.com')).toBe(true);
    expect(isDisposableEmailDomain('user@guerrillamail.com')).toBe(true);
    expect(isDisposableEmailDomain('user@10minutemail.com')).toBe(true);
    expect(isDisposableEmailDomain('user@yopmail.com')).toBe(true);
    expect(isDisposableEmailDomain('user@trashmail.com')).toBe(true);
    expect(isDisposableEmailDomain('user@getnada.com')).toBe(true);
    expect(isDisposableEmailDomain('user@temp-mail.org')).toBe(true);
  });

  it('is case-insensitive and accepts bare domains', () => {
    expect(isDisposableEmailDomain('USER@Mailinator.COM')).toBe(true);
    expect(isDisposableEmailDomain('mailinator.com')).toBe(true);
  });

  it('matches subdomains of listed domains', () => {
    expect(isDisposableEmailDomain('user@x.mailinator.com')).toBe(true);
    expect(isDisposableEmailDomain('user@a.b.guerrillamail.com')).toBe(true);
  });

  it('does not match legitimate or lookalike domains', () => {
    expect(isDisposableEmailDomain('user@gmail.com')).toBe(false);
    expect(isDisposableEmailDomain('user@notmailinator.com')).toBe(false);
    expect(isDisposableEmailDomain('user@mailinator.com.evil.com')).toBe(false);
    expect(isDisposableEmailDomain('')).toBe(false);
    expect(isDisposableEmailDomain('user@')).toBe(false);
  });
});

describe('resolveLocalUploadPath', () => {
  const ROOT = '/srv/app/public/uploads';

  it('resolves files inside the uploads dir', () => {
    expect(resolveLocalUploadPath('photo.jpg', ROOT)).toBe(`${ROOT}/photo.jpg`);
    expect(resolveLocalUploadPath('nested/pic.png', ROOT)).toBe(
      `${ROOT}/nested/pic.png`,
    );
  });

  it('rejects .. escapes', () => {
    expect(resolveLocalUploadPath('../secret.txt', ROOT)).toBeNull();
    expect(resolveLocalUploadPath('a/../../secret', ROOT)).toBeNull();
    expect(resolveLocalUploadPath('..', ROOT)).toBeNull();
    expect(resolveLocalUploadPath('../../etc/passwd', ROOT)).toBeNull();
  });

  it('rejects the root itself and empty names', () => {
    expect(resolveLocalUploadPath('.', ROOT)).toBeNull();
    expect(resolveLocalUploadPath('', ROOT)).toBeNull();
  });
});

describe('ownedImageKey', () => {
  it('accepts the caller’s own uploads/previews keys', () => {
    expect(ownedImageKey('u1', 'uploads/u1/123-photo.jpg')).toBe(
      'uploads/u1/123-photo.jpg',
    );
    expect(ownedImageKey('u1', 'previews/u1/123-photo.jpg')).toBe(
      'previews/u1/123-photo.jpg',
    );
  });

  it('canonicalizes internal .. segments before judging', () => {
    expect(ownedImageKey('u1', 'uploads/u1/../u1/x.jpg')).toBe('uploads/u1/x.jpg');
  });

  it('rejects other users’ keys and traversal into them', () => {
    expect(ownedImageKey('u1', 'uploads/u2/123-photo.jpg')).toBeNull();
    expect(ownedImageKey('u1', 'uploads/u1/../../u2/x.jpg')).toBeNull();
    expect(ownedImageKey('u1', '../uploads/u1/x.jpg')).toBeNull();
  });

  it('rejects non-generation namespaces and malformed keys', () => {
    expect(ownedImageKey('u1', 'avatars/u1/123-a.jpg')).toBeNull();
    expect(ownedImageKey('u1', 'uploads/u1')).toBeNull();
    expect(ownedImageKey('u1', '')).toBeNull();
  });

  it('never validates without a userId', () => {
    expect(ownedImageKey(undefined, 'uploads/u1/x.jpg')).toBeNull();
    expect(ownedImageKey('', 'uploads/u1/x.jpg')).toBeNull();
  });
});
