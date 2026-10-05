import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      json: async () => body,
      ok: !init?.status || (init.status >= 200 && init.status < 300),
    })),
  },
}));

vi.mock('../lib/api/auth', () => ({
  requireApiAdmin: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    creditWallet: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    creditTransaction: {
      create: vi.fn(),
    },
    membership: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
    },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return cb;
    }),
  },
}));

import { POST } from '../app/api/admin/users/route';
import { prisma } from '../lib/db';
import { requireApiAdmin } from '../lib/api/auth';

describe('Admin Users API (POST /api/admin/users)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'mock-super-secret-key-32chars-long-for-tests';
    (requireApiAdmin as any).mockResolvedValue({
      id: 'admin_1',
      email: 'admin@example.com',
      role: 'ADMIN',
    });
  });

  it('rejects unauthorized requests if requireApiAdmin throws FORBIDDEN', async () => {
    (requireApiAdmin as any).mockRejectedValue(new Error('FORBIDDEN'));

    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'set_role', userId: 'target_1', role: 'ADMIN' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('handles set_credits and updates balance atomically', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'target_1',
      credits: 50,
      email: 'target@example.com',
      creditWallet: { balance: 50 },
    });
    (prisma.creditWallet.upsert as any).mockResolvedValue({ balance: 75 });

    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'set_credits',
        userId: 'target_1',
        balance: 75,
        reason: 'Bonus credits grant',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.balance).toBe(75);
    expect(prisma.creditWallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'target_1' },
        update: { balance: 75 },
      })
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target_1' },
        data: { credits: 75 },
      })
    );
  });

  it('handles set_password and hashes password with bcrypt', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'target_1',
      email: 'target@example.com',
    });

    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'set_password',
        userId: 'target_1',
        password: 'NewSecurePassword123!',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target_1' },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
        }),
      })
    );
  });

  it('handles soft delete and restore actions', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'target_1',
      email: 'target@example.com',
      status: 'ACTIVE',
    });

    // 1. Delete
    const deleteReq = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete',
        userId: 'target_1',
      }),
    });
    const deleteRes = await POST(deleteReq);
    expect(deleteRes.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target_1' },
        data: expect.objectContaining({
          status: 'SUSPENDED',
          deletedAt: expect.any(Date),
        }),
      })
    );

    // 2. Restore
    const restoreReq = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'restore',
        userId: 'target_1',
      }),
    });
    const restoreRes = await POST(restoreReq);
    expect(restoreRes.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target_1' },
        data: {
          deletedAt: null,
          status: 'ACTIVE',
        },
      })
    );
  });
});

