'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlanRecord, EditUserFormState } from './user-types';

interface UserEditMembershipTabProps {
  plans: PlanRecord[];
  form: EditUserFormState;
  setForm: React.Dispatch<React.SetStateAction<EditUserFormState>>;
}

export function UserEditMembershipTab({ plans, form, setForm }: UserEditMembershipTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-1.5">
        <Label htmlFor="edit-tier" className="text-xs">Membership Tier</Label>
        <Select
          value={form.membership}
          onValueChange={(val: any) => setForm((prev) => ({ ...prev, membership: val }))}
        >
          <SelectTrigger id="edit-tier">
            <SelectValue placeholder="Select Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FREE">Free Tier</SelectItem>
            <SelectItem value="PRO">Pro Tier</SelectItem>
            <SelectItem value="PLUS">Plus Tier</SelectItem>
            <SelectItem value="AGENCY">Agency Tier</SelectItem>
            <SelectItem value="ENTERPRISE">Enterprise Tier</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-plan" className="text-xs">Associated Billing Plan (Optional)</Label>
        <Select
          value={form.planId || 'NONE'}
          onValueChange={(val) =>
            setForm((prev) => ({ ...prev, planId: val === 'NONE' ? '' : val }))
          }
        >
          <SelectTrigger id="edit-plan">
            <SelectValue placeholder="Select active plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">No specific plan / Default</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.tier}) — ${p.monthlyPriceUSD}/mo ({p.creditsIncluded} credits)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Selecting an active plan associates a membership record with automatic renewal periods.
        </p>
      </div>
    </div>
  );
}
