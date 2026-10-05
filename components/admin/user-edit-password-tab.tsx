'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { EditUserFormState } from './user-types';

interface UserEditPasswordTabProps {
  form: EditUserFormState;
  setForm: React.Dispatch<React.SetStateAction<EditUserFormState>>;
}

export function UserEditPasswordTab({ form, setForm }: UserEditPasswordTabProps) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="space-y-4 pt-4">
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Password Reset Notice</span>
        </div>
        <p className="mt-1 text-muted-foreground">
          Entering a new password here will immediately overwrite the password hash with bcrypt 12 rounds. Leave blank to keep existing password.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-password" className="text-xs">New Password</Label>
        <div className="relative">
          <Input
            id="edit-password"
            type={showPassword ? 'text' : 'password'}
            value={form.newPassword}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, newPassword: e.target.value }))
            }
            placeholder="Enter at least 6 characters..."
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
