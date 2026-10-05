'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coins } from 'lucide-react';
import { formatCredits } from '@/lib/utils';
import type { UserRecord, EditUserFormState } from './user-types';

interface UserEditCreditsTabProps {
  user: UserRecord;
  form: EditUserFormState;
  setForm: React.Dispatch<React.SetStateAction<EditUserFormState>>;
}

export function UserEditCreditsTab({ user, form, setForm }: UserEditCreditsTabProps) {
  const currentStored = user.creditWallet?.balance ?? user.credits ?? 0;

  return (
    <div className="space-y-4 pt-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Original Stored Balance</p>
            <p className="text-2xl font-bold font-mono text-amber-400">
              {formatCredits(currentStored)}
            </p>
          </div>
          <Coins className="h-8 w-8 text-amber-400/50" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-credits" className="text-xs">Direct Set Balance</Label>
        <Input
          id="edit-credits"
          type="number"
          min="0"
          step="1"
          value={form.credits}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              credits: Math.max(0, parseInt(e.target.value) || 0),
            }))
          }
        />
        <p className="text-[11px] text-muted-foreground">
          Directly sets the new credit balance and logs the transaction delta in the audit log.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setForm((p) => ({ ...p, credits: p.credits + 10 }))}
        >
          +10
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setForm((p) => ({ ...p, credits: p.credits + 50 }))}
        >
          +50
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setForm((p) => ({ ...p, credits: p.credits + 200 }))}
        >
          +200
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setForm((p) => ({ ...p, credits: Math.max(0, p.credits - 50) }))}
        >
          -50
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-credit-reason" className="text-xs">Reason / Audit Log Note</Label>
        <Input
          id="edit-credit-reason"
          value={form.creditAdjustmentReason}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, creditAdjustmentReason: e.target.value }))
          }
          placeholder="e.g. Compensation for support ticket / manual bonus"
        />
      </div>
    </div>
  );
}
