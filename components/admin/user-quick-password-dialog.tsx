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
import { Lock, Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { UserRecord } from './user-types';

interface QuickPasswordDialogProps {
  user: UserRecord | null;
  onClose: () => void;
}

export function UserQuickPasswordDialog({ user, onClose }: QuickPasswordDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [password, setPassword] = React.useState<string>('');
  const [showPassword, setShowPassword] = React.useState(false);

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
      toast({ title: 'Password reset successfully', variant: 'success' });
      setPassword('');
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
            <Lock className="h-5 w-5 text-sky-400" />
            Reset User Password
          </DialogTitle>
          <DialogDescription>
            Set a new login password for <strong>{user.email}</strong>
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 6) return;
            mutation.mutate({
              action: 'set_password',
              userId: user.id,
              password: password.trim(),
            });
          }}
          className="space-y-4 p-5 pt-0"
        >
          <div className="space-y-1.5">
            <Label htmlFor="quick-pass-input" className="text-xs">New Password (min 6 chars) *</Label>
            <div className="relative">
              <Input
                id="quick-pass-input"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password..."
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

          <DialogFooter className="p-0 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
