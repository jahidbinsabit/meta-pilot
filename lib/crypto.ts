/**
 * Symmetric encryption helpers for secrets stored at rest:
 *   - PaymentGatewayConfig.credentialsJson
 *   - AiProviderConfig.apiKeyEncrypted
 *
 * Uses AES-256-GCM with a random 12-byte nonce, base64-encoded as
 * `nonce:tag:ciphertext`.
 *
 * FAILS CLOSED: if no encryption key is configured (SECRET_KEY / AUTH_SECRET /
 * NEXTAUTH_SECRET), encrypt/decrypt throw instead of silently storing secrets
 * in plaintext. (Security fix 19 Oct 2026.)
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
  if (!key) {
    throw new Error('ENCRYPTION_KEY_MISSING: set SECRET_KEY (or AUTH_SECRET) to store secrets');
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const key = getKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY_MISSING: set SECRET_KEY (or AUTH_SECRET) to read secrets');
  }
  try {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Not a valid encrypted blob — do not silently return as-is.
    throw new Error('DECRYPT_FAILED: payload is not a valid encrypted secret');
  }
}

export function isEncrypted(payload: string): boolean {
  if (!payload) return false;
  const key = getKey();
  return !!key;
}
