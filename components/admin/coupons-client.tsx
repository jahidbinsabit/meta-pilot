'use client';

import * as React from 'react';
import { Plus, Trash2, Loader2, Ticket } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Coupon = {
  id: string;
  code: string;
  creditsAmount: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export function CouponsClient() {
  const [coupons, setCoupons] = React.useState<Coupon[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [code, setCode] = React.useState('');
  const [credits, setCredits] = React.useState('100');
  const [maxUses, setMaxUses] = React.useState('1');
  const [expires, setExpires] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState('');

  const fetchCoupons = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/coupons');
      const json = await res.json();
      // T4-45: a failed load used to render as an empty list — surface it.
      if (!res.ok) {
        setError(json.error || 'Failed to load coupons');
        return;
      }
      setCoupons(json.coupons || []);
    } catch {
      setError('Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.toUpperCase(),
          creditsAmount: parseInt(credits, 10),
          maxUses: parseInt(maxUses, 10),
          // T4-40: expiresAt was accepted by the API and displayed in the
          // list but had no input — wire the create form to it (end of the
          // chosen day, local time).
          expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to create coupon');
        return;
      }
      setCoupons((prev) => [json.coupon, ...prev]);
      setCode('');
      setCredits('100');
      setMaxUses('1');
      setExpires('');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this coupon?')) return;
    setError('');
    try {
      const res = await fetch(`/api/admin/coupons?id=${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      // T4-35: only flip local state when the server actually deactivated.
      if (!res.ok) {
        setError(json.error || 'Failed to deactivate coupon');
        return;
      }
      setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, isActive: false } : c)));
    } catch {
      setError('Failed to deactivate coupon');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Admin</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Coupons</h1>
        <p className="mt-1 text-sm text-muted-foreground">Promo codes users can redeem for credits.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create coupon</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME100"
                className="w-40"
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Credits</label>
              <Input
                type="number"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-28"
                min={1}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max uses</label>
              <Input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="w-28"
                min={1}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Expires (optional)</label>
              <Input
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All coupons ({coupons.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : coupons.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No coupons yet.</p>
          ) : (
            <div className="space-y-2">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Ticket className="h-5 w-5 text-accent" />
                    <div>
                      <p className="font-mono font-semibold">{c.code}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.creditsAmount} credits · {c.usedCount}/{c.maxUses} used
                        {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.isActive ? 'success' : 'secondary'}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {c.isActive && (
                      <Button variant="ghost" size="sm" onClick={() => handleDeactivate(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
