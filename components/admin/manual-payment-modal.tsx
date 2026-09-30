'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Plan, CreditPackage } from '@prisma/client';

interface UserOption {
  id: string;
  name: string | null;
  email: string | null;
}

interface ManualPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserOption[];
  plans: Plan[];
  packages: CreditPackage[];
  onSubmit: (data: any) => Promise<void>;
  busy?: boolean;
}

export function ManualPaymentModal({
  open,
  onOpenChange,
  users,
  plans,
  packages,
  onSubmit,
  busy,
}: ManualPaymentModalProps) {
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [userSearch, setUserSearch] = React.useState('');
  const [type, setType] = React.useState<'plan' | 'credits'>('plan');
  const [planId, setPlanId] = React.useState('');
  const [packageId, setPackageId] = React.useState('');
  const [customCredits, setCustomCredits] = React.useState(100);
  const [currency, setCurrency] = React.useState<'BDT' | 'USD'>('BDT');
  const [amount, setAmount] = React.useState<number>(0);
  const [method, setMethod] = React.useState('BKASH_MANUAL');
  const [senderNumber, setSenderNumber] = React.useState('');
  const [transactionRef, setTransactionRef] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [autoApprove, setAutoApprove] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      if (users.length > 0 && !selectedUserId) {
        setSelectedUserId(users[0].id);
      }
      if (plans.length > 0 && !planId) {
        setPlanId(plans[0].id);
        setAmount(currency === 'BDT' ? plans[0].monthlyPriceBDT : plans[0].monthlyPriceUSD);
      }
      setTransactionRef(`ADMIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    }
  }, [open, users, plans, selectedUserId, planId, currency]);

  const handlePlanChange = (id: string) => {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (p) setAmount(currency === 'BDT' ? p.monthlyPriceBDT : p.monthlyPriceUSD);
  };

  const handlePackageChange = (id: string) => {
    setPackageId(id);
    const pkg = packages.find((x) => x.id === id);
    if (pkg) setAmount(currency === 'BDT' ? pkg.priceBDT : pkg.priceUSD);
  };

  const handleCurrencyChange = (curr: 'BDT' | 'USD') => {
    setCurrency(curr);
    if (type === 'plan') {
      const p = plans.find((x) => x.id === planId);
      if (p) setAmount(curr === 'BDT' ? p.monthlyPriceBDT : p.monthlyPriceUSD);
    } else if (packageId) {
      const pkg = packages.find((x) => x.id === packageId);
      if (pkg) setAmount(curr === 'BDT' ? pkg.priceBDT : pkg.priceUSD);
    }
  };

  const filteredUsers = React.useMemo(() => {
    if (!userSearch.trim()) return users.slice(0, 50);
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.name?.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    ).slice(0, 50);
  }, [users, userSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    await onSubmit({
      userId: selectedUserId,
      type,
      planId: type === 'plan' ? planId : undefined,
      packageId: type === 'credits' && packageId ? packageId : undefined,
      credits: type === 'credits' && !packageId ? Number(customCredits) : undefined,
      amountBDT: currency === 'BDT' ? Number(amount) : 0,
      amountUSD: currency === 'USD' ? Number(amount) : 0,
      method,
      transactionRef: transactionRef.trim(),
      senderNumber: senderNumber.trim() || 'ADMIN_DIRECT',
      notes: notes.trim(),
      autoApprove,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Record Manual Payment / Credit User</DialogTitle>
            <DialogDescription>
              Directly credit a user account or activate a plan for payments received offline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 px-1">
            <div className="space-y-1.5">
              <Label htmlFor="userSelect">Select User</Label>
              <Input
                placeholder="Search user by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="mb-1.5 text-xs"
              />
              <select
                id="userSelect"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm"
              >
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email || u.id})` : u.email || u.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('plan')}
                className={`py-2 px-3 text-xs font-medium rounded-md border transition-all ${
                  type === 'plan'
                    ? 'border-accent bg-accent/10 text-accent font-semibold'
                    : 'border-border text-muted-foreground hover:border-border/80'
                }`}
              >
                Plan Membership
              </button>
              <button
                type="button"
                onClick={() => setType('credits')}
                className={`py-2 px-3 text-xs font-medium rounded-md border transition-all ${
                  type === 'credits'
                    ? 'border-accent bg-accent/10 text-accent font-semibold'
                    : 'border-border text-muted-foreground hover:border-border/80'
                }`}
              >
                Credit Package / Top-up
              </button>
            </div>

            {type === 'plan' ? (
              <div>
                <Label htmlFor="planSelect">Target Plan</Label>
                <select
                  id="planSelect"
                  value={planId}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (৳{p.monthlyPriceBDT} / ${p.monthlyPriceUSD})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="packageSelect">Credit Package</Label>
                  <select
                    id="packageSelect"
                    value={packageId}
                    onChange={(e) => handlePackageChange(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">-- Custom Credits Amount --</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.credits} credits — ৳{pkg.priceBDT} / ${pkg.priceUSD})
                      </option>
                    ))}
                  </select>
                </div>
                {!packageId && (
                  <div>
                    <Label htmlFor="customCredits">Custom Credits to Add</Label>
                    <Input
                      id="customCredits"
                      type="number"
                      min="1"
                      value={customCredits}
                      onChange={(e) => setCustomCredits(parseInt(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <select
                  id="paymentMethod"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="BKASH_MANUAL">bKash (Manual)</option>
                  <option value="NAGAD_MANUAL">Nagad (Manual)</option>
                  <option value="ROCKET_MANUAL">Rocket (Manual)</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="STRIPE">Stripe / Card</option>
                  <option value="OTHER_GATEWAY">Cash / Direct Admin</option>
                </select>
              </div>
              <div>
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => handleCurrencyChange(e.target.value as 'BDT' | 'USD')}
                  className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="BDT">BDT (৳)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">Amount Received</Label>
                <Input
                  id="amount"
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="senderPhone">Sender Phone / Account</Label>
                <Input
                  id="senderPhone"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  placeholder="e.g. 017XXXXXXXX"
                  className="mt-1 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="trxId">Transaction ID (TrxID)</Label>
              <Input
                id="trxId"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. BL929X1A or ADMIN-..."
                required
                className="mt-1 font-mono text-xs uppercase"
              />
            </div>

            <div>
              <Label htmlFor="adminNotes">Admin Notes / Reference</Label>
              <Textarea
                id="adminNotes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Verified payment / requested manual activation"
                className="mt-1 text-xs"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
              <div>
                <Label className="text-sm font-semibold">Auto-Approve & Fulfill</Label>
                <p className="text-[11px] text-muted-foreground">
                  Immediately adds credits or activates plan for the user.
                </p>
              </div>
              <Toggle checked={autoApprove} onChange={setAutoApprove} />
            </div>

          <DialogFooter className="gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Record & Grant Payment
            </Button>
          </DialogFooter>

          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

