'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Save, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

type CreditPackage = {
  id: string;
  name: string;
  credits: number;
  priceUSD: number;
  priceBDT: number;
  isActive: boolean;
  sortOrder: number;
};

type NewPackage = {
  name: string;
  credits: number;
  priceUSD: number;
  priceBDT: number;
  isActive: boolean;
  sortOrder: number;
};

const EMPTY_NEW: NewPackage = {
  name: '',
  credits: 0,
  priceUSD: 0,
  priceBDT: 0,
  isActive: true,
  sortOrder: 0,
};

export function CreditPackagesClient({ initialPackages }: { initialPackages: CreditPackage[] }) {
  const [packages, setPackages] = React.useState<CreditPackage[]>(initialPackages);
  const [editing, setEditing] = React.useState<CreditPackage | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [draft, setDraft] = React.useState<NewPackage>(EMPTY_NEW);
  const toast = useToast();

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreditPackage> }) => {
      const res = await fetch(`/api/admin/credit-packages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update package');
      return res.json() as Promise<CreditPackage>;
    },
    onSuccess: (updated) => {
      setPackages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditing(null);
      toast({ title: 'Package updated', variant: 'success' });
    },
    onError: () => toast({ title: 'Failed to update package', variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/credit-packages/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete package');
      return res.json();
    },
    onSuccess: (_, id) => {
      setPackages((prev) => prev.filter((p) => p.id !== id));
      toast({ title: 'Package deleted', variant: 'success' });
    },
    onError: () => toast({ title: 'Failed to delete package', variant: 'error' }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: NewPackage) => {
      const res = await fetch('/api/admin/credit-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create package');
      }
      return res.json() as Promise<CreditPackage>;
    },
    onSuccess: (created) => {
      setPackages((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
      setShowAdd(false);
      setDraft(EMPTY_NEW);
      toast({ title: 'Package created', variant: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'error' }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Credit Packages
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Credit Packages</h1>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Package
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All packages</CardTitle>
          <CardDescription>One-time credit top-up packages users can buy.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4 text-right">Credits</th>
                  <th className="pb-3 pr-4 text-right">USD</th>
                  <th className="pb-3 pr-4 text-right">BDT</th>
                  <th className="pb-3 pr-4 text-center">Active</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => {
                  const isEditing = editing?.id === pkg.id;
                  const ep = editing;
                  return (
                    <tr key={pkg.id} className="border-t border-border">
                      <td className="py-3 pr-4">
                        {isEditing && ep ? (
                          <Input
                            value={ep.name}
                            onChange={(e) => setEditing({ ...ep, name: e.target.value })}
                            className="h-8 w-40"
                          />
                        ) : (
                          pkg.name
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            value={ep.credits}
                            onChange={(e) =>
                              setEditing({ ...ep, credits: parseInt(e.target.value) || 0 })
                            }
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          pkg.credits.toLocaleString()
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={ep.priceUSD}
                            onChange={(e) =>
                              setEditing({ ...ep, priceUSD: parseFloat(e.target.value) || 0 })
                            }
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          `$${pkg.priceUSD.toFixed(2)}`
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            value={ep.priceBDT}
                            onChange={(e) =>
                              setEditing({ ...ep, priceBDT: parseInt(e.target.value) || 0 })
                            }
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          `\u09F3${pkg.priceBDT}`
                        )}
                      </td>
                      <td className="py-3 pr-4 text-center">
                        {isEditing && ep ? (
                          <input
                            type="checkbox"
                            checked={ep.isActive}
                            onChange={(e) => setEditing({ ...ep, isActive: e.target.checked })}
                            className="h-4 w-4 rounded border-input"
                          />
                        ) : (
                          <span
                            className={pkg.isActive ? 'text-emerald-500' : 'text-muted-foreground'}
                          >
                            {pkg.isActive ? 'Yes' : 'No'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {isEditing && ep ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateMutation.mutate({ id: ep.id, data: ep })}
                              disabled={updateMutation.isPending}
                            >
                              {updateMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing({ ...pkg })}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteMutation.mutate(pkg.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Credit Package</DialogTitle>
            <DialogDescription>Create a one-time credit top-up package.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="pkg-name">Name</Label>
              <Input
                id="pkg-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g., 500 Credit Pack"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pkg-credits">Credits</Label>
              <Input
                id="pkg-credits"
                type="number"
                value={draft.credits}
                onChange={(e) => setDraft({ ...draft, credits: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pkg-usd">Price USD</Label>
                <Input
                  id="pkg-usd"
                  type="number"
                  step="0.01"
                  value={draft.priceUSD}
                  onChange={(e) =>
                    setDraft({ ...draft, priceUSD: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pkg-bdt">Price BDT</Label>
                <Input
                  id="pkg-bdt"
                  type="number"
                  value={draft.priceBDT}
                  onChange={(e) => setDraft({ ...draft, priceBDT: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(draft)}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
