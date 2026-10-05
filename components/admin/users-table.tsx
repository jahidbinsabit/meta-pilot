'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users } from 'lucide-react';
import { UserTableRow } from './user-table-row';
import type { UserRecord } from './user-types';

interface UsersTableProps {
  users: UserRecord[];
  isLoading: boolean;
  isFiltered: boolean;
  onResetFilters: () => void;
  onEdit: (user: UserRecord) => void;
  onAdjustCredits: (user: UserRecord) => void;
  onResetPassword: (user: UserRecord) => void;
  onToggleStatus: (user: UserRecord) => void;
  onDelete: (user: UserRecord) => void;
  onRestore: (user: UserRecord) => void;
}

export function UsersTable({
  users,
  isLoading,
  isFiltered,
  onResetFilters,
  onEdit,
  onAdjustCredits,
  onResetPassword,
  onToggleStatus,
  onDelete,
  onRestore,
}: UsersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="py-3 pl-5 pr-3">User & Identity</th>
            <th className="px-3 py-3">Role</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Membership</th>
            <th className="px-3 py-3">Credits</th>
            <th className="px-3 py-3">AI Keys</th>
            <th className="px-3 py-3">Joined</th>
            <th className="py-3 pl-3 pr-5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-muted-foreground">
                <div className="flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-5 w-5 animate-spin text-accent" />
                  <span>Loading user accounts...</span>
                </div>
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-muted-foreground">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Users className="h-8 w-8 text-muted-foreground/50" />
                  <p className="font-medium text-foreground">No users found</p>
                  <p className="text-xs">Try adjusting your filters or search keywords.</p>
                  {isFiltered && (
                    <Button variant="outline" size="xs" onClick={onResetFilters} className="mt-2">
                      Reset Filters
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            users.map((u) => (
              <UserTableRow
                key={u.id}
                user={u}
                onEdit={onEdit}
                onAdjustCredits={onAdjustCredits}
                onResetPassword={onResetPassword}
                onToggleStatus={onToggleStatus}
                onDelete={onDelete}
                onRestore={onRestore}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
