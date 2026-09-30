import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  parseGatewayCredentials,
} from '@/lib/payments/config';

describe('Payment Config & Encryption Helpers', () => {
  beforeAll(() => {
    process.env.SECRET_KEY = 'test-secret-key-for-payments-aes256';
  });

  it('encrypts and decrypts secret payloads correctly', () => {
    const secretData = JSON.stringify({
      secretKey: 'sk_test_1234567890',
      publishableKey: 'pk_test_0987654321',
      accountNumber: '01700000000',
    });

    const encrypted = encryptSecret(secretData);
    expect(encrypted).not.toBe(secretData);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secretData);

    const parsed = JSON.parse(decrypted);
    expect(parsed.secretKey).toBe('sk_test_1234567890');
    expect(parsed.publishableKey).toBe('pk_test_0987654321');
    expect(parsed.accountNumber).toBe('01700000000');
  });

  it('handles parseGatewayCredentials with encrypted strings, raw strings, objects and nulls', () => {
    // Null / empty
    expect(parseGatewayCredentials(null)).toEqual({});
    expect(parseGatewayCredentials('')).toEqual({});

    // Raw JSON object
    const plainObj = { apiKey: 'xyz' };
    expect(parseGatewayCredentials(plainObj)).toEqual(plainObj);

    // Encrypted string
    const sample = JSON.stringify({ number: '01800000000', type: 'Merchant' });
    const enc = encryptSecret(sample);
    expect(parseGatewayCredentials(enc)).toEqual({
      number: '01800000000',
      type: 'Merchant',
    });

    // Plain JSON string fallback
    expect(parseGatewayCredentials('{"foo":"bar"}')).toEqual({ foo: 'bar' });
  });

  it('returns empty string if decryptSecret receives empty text', () => {
    expect(decryptSecret('')).toBe('');
  });
});

