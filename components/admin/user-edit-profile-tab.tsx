'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import type { EditUserFormState } from './user-types';

interface UserEditProfileTabProps {
  form: EditUserFormState;
  setForm: React.Dispatch<React.SetStateAction<EditUserFormState>>;
}

export function UserEditProfileTab({ form, setForm }: UserEditProfileTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name" className="text-xs">Full Name</Label>
          <Input
            id="edit-name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Jane Doe"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-email" className="text-xs">Email Address *</Label>
          <Input
            id="edit-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="user@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-role" className="text-xs">Role</Label>
          <Select
            value={form.role}
            onValueChange={(val: 'USER' | 'ADMIN') =>
              setForm((prev) => ({ ...prev, role: val }))
            }
          >
            <SelectTrigger id="edit-role">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USER">Standard User</SelectItem>
              <SelectItem value="ADMIN">System Administrator</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-status" className="text-xs">Account Status</Label>
          <Select
            value={form.status}
            onValueChange={(val: 'ACTIVE' | 'SUSPENDED' | 'PENDING') =>
              setForm((prev) => ({ ...prev, status: val }))
            }
          >
            <SelectTrigger id="edit-status">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active (Full Access)</SelectItem>
              <SelectItem value="SUSPENDED">Suspended (Blocked)</SelectItem>
              <SelectItem value="PENDING">Pending Verification</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <Toggle
          label="Email Verified"
          description="Mark whether user's email address has been verified"
          checked={form.emailVerified}
          onChange={(checked) => setForm((prev) => ({ ...prev, emailVerified: checked }))}
        />
      </div>
    </div>
  );
}
