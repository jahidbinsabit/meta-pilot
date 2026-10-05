'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
import type { UserRecord } from './user-types';

interface QuickDeleteDialogProps {
  deleteConfirmUser: UserRecord | null;
  onCloseDeleteConfirm: () => void;
  restoreConfirmUser: UserRecord | null;
  onCloseRestoreConfirm: () => void;
}

export function UserQuickDeleteDialog({
  deleteConfirmUser,
  onCloseDeleteConfirm,
  restoreConfirmUser,
  onCloseRestoreConfirm,
}: QuickDeleteDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      if (vars.action === 'delete') {
        toast({ title: 'User account soft deleted', variant: 'success' });
        onCloseDeleteConfirm();
      } else if (vars.action === 'restore') {
        toast({ title: 'User account restored', variant: 'success' });
        onCloseRestoreConfirm();
      }
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    },
  });

  return (
    <>
      {/* Soft Delete Modal */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={(open) => !open && onCloseDeleteConfirm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Soft Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to soft delete account <strong>{deleteConfirmUser?.email}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 pt-0 text-xs text-muted-foreground">
            This will set user status to <code className="text-destructive font-mono">SUSPENDED</code> and record the deletion timestamp. The account can be restored at any time.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onCloseDeleteConfirm} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmUser && mutation.mutate({ action: 'delete', userId: deleteConfirmUser.id })}
              disabled={mutation.isPending}
              className="gap-1.5"
            >
              {mutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Soft Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Modal */}
      <Dialog open={!!restoreConfirmUser} onOpenChange={(open) => !open && onCloseRestoreConfirm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <RotateCcw className="h-5 w-5" />
              Restore User Account
            </DialogTitle>
            <DialogDescription>
              Restore deleted account for <strong>{restoreConfirmUser?.email}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 pt-0 text-xs text-muted-foreground">
            This will clear the deletion timestamp and reset status back to <code className="text-emerald-400 font-mono">ACTIVE</code>.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onCloseRestoreConfirm} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => restoreConfirmUser && mutation.mutate({ action: 'restore', userId: restoreConfirmUser.id })}
              disabled={mutation.isPending}
              className="gap-1.5"
            >
              {mutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Restore Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
