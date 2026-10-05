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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Edit, RefreshCw } from 'lucide-react';
import { UserEditProfileTab } from './user-edit-profile-tab';
import { UserEditCreditsTab } from './user-edit-credits-tab';
import { UserEditMembershipTab } from './user-edit-membership-tab';
import { UserEditPasswordTab } from './user-edit-password-tab';
import { UserEditAiKeysTab } from './user-edit-aikeys-tab';
import type { UserRecord, PlanRecord, EditUserFormState } from './user-types';

interface UserEditDialogProps {
  user: UserRecord | null;
  plans: PlanRecord[];
  onClose: () => void;
}

export function UserEditDialog({ user, plans, onClose }: UserEditDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = React.useState('general');

  const [form, setForm] = React.useState<EditUserFormState>({
    name: '',
    email: '',
    role: 'USER',
    status: 'ACTIVE',
    membership: 'FREE',
    planId: '',
    emailVerified: false,
    credits: 0,
    creditAdjustmentReason: '',
    newPassword: '',
    preferredAiProvider: 'gemini',
    geminiApiKey: '',
    openaiApiKey: '',
    grokApiKey: '',
    clearGeminiKey: false,
    clearOpenaiKey: false,
    clearGrokKey: false,
  });

  React.useEffect(() => {
    if (user) {
      const activePlan = user.memberships?.find((m) => m.status === 'ACTIVE')?.plan;
      const balance = user.creditWallet?.balance ?? user.credits;
      setForm({
        name: user.name || '',
        email: user.email,
        role: user.role,
        status: user.status,
        membership: user.membership,
        planId: activePlan?.id || '',
        emailVerified: !!user.emailVerified,
        credits: balance,
        creditAdjustmentReason: '',
        newPassword: '',
        preferredAiProvider: user.preferredAiProvider || 'gemini',
        geminiApiKey: '',
        openaiApiKey: '',
        grokApiKey: '',
        clearGeminiKey: false,
        clearOpenaiKey: false,
        clearGrokKey: false,
      });
      setTab('general');
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to update user');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User updated successfully', variant: 'success' });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: 'Update failed', description: err.message, variant: 'error' });
    },
  });
  if (!user) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      action: 'edit_user',
      userId: user.id,
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      status: form.status,
      membership: form.membership,
      planId: form.planId || undefined,
      emailVerified: form.emailVerified,
      credits: form.credits,
      creditReason: form.creditAdjustmentReason || 'Admin updated balance in portal',
      preferredAiProvider: form.preferredAiProvider,
    };

    if (form.newPassword && form.newPassword.trim().length >= 6) {
      payload.password = form.newPassword.trim();
    }
    if (form.geminiApiKey && form.geminiApiKey.trim()) {
      payload.geminiApiKey = form.geminiApiKey.trim();
    } else if (form.clearGeminiKey) {
      payload.geminiApiKey = '';
    }
    if (form.openaiApiKey && form.openaiApiKey.trim()) {
      payload.openaiApiKey = form.openaiApiKey.trim();
    } else if (form.clearOpenaiKey) {
      payload.openaiApiKey = '';
    }
    if (form.grokApiKey && form.grokApiKey.trim()) {
      payload.grokApiKey = form.grokApiKey.trim();
    } else if (form.clearGrokKey) {
      payload.grokApiKey = '';
    }

    mutation.mutate(payload);
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Edit className="h-5 w-5 text-accent" />
            Edit User: {user.email}
          </DialogTitle>
          <DialogDescription>
            ID: <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{user.id}</code>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs value={tab} onValueChange={setTab} className="w-full px-5 py-2">
            <TabsList className="grid w-full grid-cols-5 text-xs">
              <TabsTrigger value="general">Profile</TabsTrigger>
              <TabsTrigger value="credits">Credits</TabsTrigger>
              <TabsTrigger value="membership">Tier</TabsTrigger>
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="aikeys">AI Keys</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <UserEditProfileTab form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="credits">
              <UserEditCreditsTab user={user} form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="membership">
              <UserEditMembershipTab plans={plans} form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="password">
              <UserEditPasswordTab form={form} setForm={setForm} />
            </TabsContent>

            <TabsContent value="aikeys">
              <UserEditAiKeysTab user={user} form={form} setForm={setForm} />
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
