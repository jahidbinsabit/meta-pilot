'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

type Plan = {
  id: string;
  tier: string;
  name: string;
  monthlyPriceUSD: number;
  monthlyPriceBDT: number;
  creditsIncluded: number;
  dailyFreeCredits: number;
  adobeAnalyticsResultLimit: number;
  isActive: boolean;
  sortOrder: number;
};

const TIERS = ['FREE', 'PRO', 'PLUS', 'AGENCY'] as const;
type TierValue = (typeof TIERS)[number];

type NewPlan = {
  tier: TierValue;
  name: string;
  monthlyPriceUSD: number;
  monthlyPriceBDT: number;
  creditsIncluded: number;
  dailyFreeCredits: number;
  adobeAnalyticsResultLimit: number;
  isActive: boolean;
  sortOrder: number;
};

const EMPTY_NEW: NewPlan = {
  tier: 'FREE',
  name: '',
  monthlyPriceUSD: 0,
  monthlyPriceBDT: 0,
  creditsIncluded: 0,
  dailyFreeCredits: 0,
  adobeAnalyticsResultLimit: 0,
  isActive: true,
  sortOrder: 0,
};

export function PlansClient({ initialPlans }: { initialPlans: Plan[] }) {
  const [plans, setPlans] = React.useState<Plan[]>(initialPlans);
  const [editing, setEditing] = React.useState<Plan | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [draft, setDraft] = React.useState<NewPlan>(EMPTY_NEW);
  const toast = useToast();

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Plan> }) => {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to update plan');
      }
      return res.json() as Promise<Plan>;
    },
    onSuccess: (updated) => {
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditing(null);
      toast({ title: 'Plan updated', variant: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message || 'Failed to update plan', variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/plans/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete plan');
      return res.json();
    },
    onSuccess: (_, id) => {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      toast({ title: 'Plan deleted', variant: 'success' });
    },
    onError: () => toast({ title: 'Failed to delete plan', variant: 'error' }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: NewPlan) => {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create plan');
      }
      return res.json() as Promise<Plan>;
    },
    onSuccess: (created) => {
      setPlans((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
      setShowAdd(false);
      setDraft(EMPTY_NEW);
      toast({ title: 'Plan created', variant: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'error' }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Plans
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Subscription Plans
          </h1>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Plan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All plans</CardTitle>
          <CardDescription>
            Configure pricing, credits, and limits for each subscription tier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">Tier</th>
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4 text-right">USD</th>
                  <th className="pb-3 pr-4 text-right">BDT</th>
                  <th className="pb-3 pr-4 text-right">Credits</th>
                  <th className="pb-3 pr-4 text-right">Daily Free</th>
                  <th className="pb-3 pr-4 text-right">AA Limit</th>
                  <th className="pb-3 pr-4 text-center">Active</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const isEditing = editing?.id === plan.id;
                  const ep = editing;
                  return (
                    <tr key={plan.id} className="border-t border-border">
                      <td className="py-3 pr-4 font-medium">{plan.tier}</td>
                      <td className="py-3 pr-4">
                        {isEditing && ep ? (
                          <Input
                            value={ep.name}
                            onChange={(e) => setEditing({ ...ep, name: e.target.value })}
                            className="h-8 w-32"
                          />
                        ) : (
                          plan.name
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            value={ep.monthlyPriceUSD}
                            onChange={(e) =>
                              setEditing({
                                ...ep,
                                monthlyPriceUSD: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          `$${plan.monthlyPriceUSD.toFixed(2)}`
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            value={ep.monthlyPriceBDT}
                            onChange={(e) =>
                              setEditing({ ...ep, monthlyPriceBDT: parseInt(e.target.value) || 0 })
                            }
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          `৳${plan.monthlyPriceBDT}`
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            value={ep.creditsIncluded}
                            onChange={(e) =>
                              setEditing({ ...ep, creditsIncluded: parseInt(e.target.value) || 0 })
                            }
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          plan.creditsIncluded.toLocaleString()
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            value={ep.dailyFreeCredits}
                            onChange={(e) =>
                              setEditing({ ...ep, dailyFreeCredits: parseInt(e.target.value) || 0 })
                            }
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          plan.dailyFreeCredits
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {isEditing && ep ? (
                          <Input
                            type="number"
                            value={ep.adobeAnalyticsResultLimit}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setEditing({
                                ...ep,
                                adobeAnalyticsResultLimit: raw === '' ? 0 : parseInt(raw, 10),
                              });
                            }}
                            className="h-8 w-20 text-right"
                          />
                        ) : (
                          plan.adobeAnalyticsResultLimit === -1
                            ? 'Unlimited'
                            : plan.adobeAnalyticsResultLimit.toLocaleString()
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
                            className={plan.isActive ? 'text-emerald-500' : 'text-muted-foreground'}
                          >
                            {plan.isActive ? 'Yes' : 'No'}
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
                              onClick={() => setEditing({ ...plan })}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteMutation.mutate(plan.id)}
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
            <DialogTitle>Add New Plan</DialogTitle>
            <DialogDescription>Create a new subscription tier.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tier">Tier</Label>
              <Select
                value={draft.tier}
                onValueChange={(v) => setDraft({ ...draft, tier: v as TierValue })}
              >
                <SelectTrigger id="tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g., Pro Monthly"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="usd">Price USD</Label>
                <Input
                  id="usd"
                  type="number"
                  step="0.01"
                  value={draft.monthlyPriceUSD}
                  onChange={(e) =>
                    setDraft({ ...draft, monthlyPriceUSD: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bdt">Price BDT</Label>
                <Input
                  id="bdt"
                  type="number"
                  value={draft.monthlyPriceBDT}
                  onChange={(e) =>
                    setDraft({ ...draft, monthlyPriceBDT: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="credits">Credits/Mo</Label>
                <Input
                  id="credits"
                  type="number"
                  value={draft.creditsIncluded}
                  onChange={(e) =>
                    setDraft({ ...draft, creditsIncluded: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="daily">Daily Free</Label>
                <Input
                  id="daily"
                  type="number"
                  value={draft.dailyFreeCredits}
                  onChange={(e) =>
                    setDraft({ ...draft, dailyFreeCredits: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="aalimit">AA Limit (-1 for unlimited)</Label>
                <Input
                  id="aalimit"
                  type="number"
                  value={draft.adobeAnalyticsResultLimit}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setDraft({
                      ...draft,
                      adobeAnalyticsResultLimit: raw === '' ? 0 : parseInt(raw, 10),
                    });
                  }}
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
              Create Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
