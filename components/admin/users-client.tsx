'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Coins, Shield, User } from 'lucide-react';

export function UsersClient({ users }: { users: any[] }) {
  const qc = useQueryClient();
  const toast = useToast();

  const adjust = useMutation({
    mutationFn: async ({
      userId,
      amount,
      role,
    }: {
      userId: string;
      amount: number;
      role?: string;
    }) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount, role }),
      });
      if (!res.ok) throw new Error('failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Updated', variant: 'success' });
    },
    onError: () => toast({ title: 'Update failed', variant: 'error' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Users</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">User Management</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>{users.length} registered accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2">User</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Membership</th>
                  <th className="pb-2">Credits</th>
                  <th className="pb-2">Joined</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{u.name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge variant={u.role === 'ADMIN' ? 'info' : 'muted'}>
                        {u.role.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="py-2 capitalize text-muted-foreground">
                      {u.membership.toLowerCase()}
                    </td>
                    <td className="py-2 font-mono">{u.credits}</td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => adjust.mutate({ userId: u.id, amount: 10 })}
                      >
                        <Coins className="h-3 w-3" /> +10
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
