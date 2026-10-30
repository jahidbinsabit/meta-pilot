'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Coins, RefreshCw } from 'lucide-react';
import { formatCredits } from '@/lib/utils';
import type { UserRecord } from './user-types';

interface QuickCreditsDialogProps {
  user: UserRecord | null;
  onClose: () => void;
}

export function UserQuickCreditsDialog({ user, onClose }: QuickCreditsDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = React.useState<number>(10);
  const [reason, setReason] = React.useState<string>('Admin manual credit adjustment');

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Operation failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Credits updated successfully', variant: 'success' });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    },
  });

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-400" />
            Quick Adjust Credits
          </DialogTitle>
          <DialogDescription>
            Adjust balance for <strong>{user.name || user.email}</strong>
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (amount === 0) return;
            mutation.mutate({
              action: 'adjust_credits',
              userId: user.id,
              amount,
              reason: reason.trim() || 'Admin manual credit adjustment',
            });
          }}
          className="space-y-4 p-5 pt-0"
        >
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">Current Balance</span>
            <span className="font-mono text-lg font-bold text-amber-400">
              {formatCredits(user.creditWallet?.balance ?? user.credits ?? 0)}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-credit-amount" className="text-xs">
              Adjustment (+ to add, - to deduct)
            </Label>
            <Input
              id="quick-credit-amount"
              type="number"
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[10, 50, 100, -10, -50].map((amt) => (
                <Button
                  key={amt}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setAmount(amt)}
                >
                  {amt > 0 ? `+${amt}` : amt}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-credit-reason" className="text-xs">Reason (Audit Log Note) *</Label>
            <Input
              id="quick-credit-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Compensation for support ticket"
            />
          </div>

          <DialogFooter className="p-0 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
