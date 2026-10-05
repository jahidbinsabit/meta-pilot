import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import { getUserAiKeysStatus, resolveUserAdapter } from '../lib/ai/user-keys';
import { prisma } from '../lib/db';

vi.mock('../lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    siteSettings: {
      findUnique: vi.fn(),
    },
  },
}));

describe('User AI Keys Management (BYOK)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'mock-super-secret-key-32chars-long-for-tests';
  });

  describe('Secret Encryption & Decryption', () => {
    it('encrypts and decrypts secret key accurately', () => {
      const secret = 'AIzaSyDemoKey123456789';
      const encrypted = encryptSecret(secret);
      expect(encrypted).not.toEqual(secret);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(secret);
    });
  });

  describe('User AI Keys Status Check', () => {
    it('returns false for missing keys and checks site enforcement flag', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        geminiApiKey: null,
        grokApiKey: null,
        openaiApiKey: null,
        preferredAiProvider: null,
      });
      (prisma.siteSettings.findUnique as any).mockResolvedValue({
        userApiKeyRequired: true,
      });

      const status = await getUserAiKeysStatus('user_123');
      expect(status.hasGemini).toBe(false);
      expect(status.hasGrok).toBe(false);
      expect(status.hasOpenai).toBe(false);
      expect(status.hasAnyKey).toBe(false);
      expect(status.userApiKeyRequired).toBe(true);
    });

    it('returns true when encrypted keys exist on user record', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        geminiApiKey: encryptSecret('AIzaSyGeminiKey'),
        grokApiKey: encryptSecret('xai-grok-key'),
        openaiApiKey: null,
        preferredAiProvider: 'grok',
      });
      (prisma.siteSettings.findUnique as any).mockResolvedValue({
        userApiKeyRequired: false,
      });

      const status = await getUserAiKeysStatus('user_123');
      expect(status.hasGemini).toBe(true);
      expect(status.hasGrok).toBe(true);
      expect(status.hasOpenai).toBe(false);
      expect(status.hasAnyKey).toBe(true);
      expect(status.preferredAiProvider).toBe('grok');
      expect(status.userApiKeyRequired).toBe(false);
    });
  });

  describe('Adapter Resolution & Enforcement', () => {
    it('throws error when userApiKeyRequired is true but user has no keys', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        geminiApiKey: null,
        grokApiKey: null,
        openaiApiKey: null,
      });
      (prisma.siteSettings.findUnique as any).mockResolvedValue({
        userApiKeyRequired: true,
      });

      await expect(
        resolveUserAdapter('user_123')
      ).rejects.toThrow('USER_API_KEY_REQUIRED');
    });

    it('returns custom adapter instance using user-provided OpenAI key', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        geminiApiKey: null,
        grokApiKey: null,
        openaiApiKey: encryptSecret('sk-proj-user-openai-key'),
        preferredAiProvider: 'openai',
      });
      (prisma.siteSettings.findUnique as any).mockResolvedValue({
        userApiKeyRequired: false,
      });

      const result = await resolveUserAdapter('user_123');
      expect(result).toBeDefined();
      expect(result?.provider).toBe('openai');
      expect(result?.isUserKey).toBe(true);
      expect(result?.adapter).toBeDefined();
    });

    it('returns custom Grok adapter instance using user-provided Grok key', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        geminiApiKey: null,
        grokApiKey: encryptSecret('xai-user-grok-key'),
        openaiApiKey: null,
        preferredAiProvider: 'grok',
      });
      (prisma.siteSettings.findUnique as any).mockResolvedValue({
        userApiKeyRequired: false,
      });

      const result = await resolveUserAdapter('user_123');
      expect(result).toBeDefined();
      expect(result?.provider).toBe('grok');
      expect(result?.isUserKey).toBe(true);
      expect(result?.adapter).toBeDefined();
    });

    it('falls back to null when user has no personal keys and requirement is disabled', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        geminiApiKey: null,
        grokApiKey: null,
        openaiApiKey: null,
      });
      (prisma.siteSettings.findUnique as any).mockResolvedValue({
        userApiKeyRequired: false,
      });

      const result = await resolveUserAdapter('user_123');
      expect(result).toBeNull();
    });
  });
});


