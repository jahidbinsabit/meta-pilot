/**
 * Symmetric encryption helpers for secrets stored at rest:
 *   - PaymentGatewayConfig.credentialsJson
 *   - AiProviderConfig.apiKeyEncrypted
 *
 * Uses AES-256-GCM with a random 12-byte nonce, base64-encoded as
 * `nonce:tag:ciphertext`. Falls back to plaintext when no key is
 * configured (dev / CI) so the platform is usable out of the box.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer | null {
  const raw = process.env.SECRET_KEY || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  if (!key) return plaintext; // dev fallback: store as-is
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const key = getKey();
  if (!key) return payload; // dev fallback
  try {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Not an encrypted blob (dev fallback plaintext) — return as-is.
    return payload;
  }
}

export function isEncrypted(payload: string): boolean {
  if (!payload) return false;
  const key = getKey();
  return !!key;
}
