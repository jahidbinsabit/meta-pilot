'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UsersStatsCards } from './users-stats-cards';
import { UsersFiltersBar } from './users-filters-bar';
import { UsersTable } from './users-table';
import { UsersPagination } from './users-pagination';
import { UserEditDialog } from './user-edit-dialog';
import { UserQuickCreditsDialog } from './user-quick-credits-dialog';
import { UserQuickPasswordDialog } from './user-quick-password-dialog';
import { UserQuickDeleteDialog } from './user-quick-delete-dialog';
import type { UserRecord, PlanRecord, StatsRecord } from './user-types';

interface UsersClientProps {
  initialUsers: UserRecord[];
  initialTotal: number;
  initialStats: StatsRecord;
  plans: PlanRecord[];
}

export function UsersClient({
  initialUsers,
  initialTotal,
  initialStats,
  plans,
}: UsersClientProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('ALL');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [membershipFilter, setMembershipFilter] = React.useState<string>('ALL');
  const [deletedFilter, setDeletedFilter] = React.useState<string>('ACTIVE_ONLY');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'admin-users',
      debouncedSearch,
      roleFilter,
      statusFilter,
      membershipFilter,
      deletedFilter,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (membershipFilter !== 'ALL') params.set('plan', membershipFilter);
      if (deletedFilter !== 'ACTIVE_ONLY') params.set('deleted', deletedFilter);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json() as Promise<{
        users: UserRecord[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        stats: StatsRecord;
      }>;
    },
    initialData: {
      users: initialUsers,
      total: initialTotal,
      page: 1,
      pageSize: 25,
      totalPages: Math.ceil(initialTotal / 25),
      stats: initialStats,
    },
    refetchOnWindowFocus: false,
  });

  const usersList = data?.users || [];
  const stats = data?.stats || initialStats;
  const totalUsersCount = data?.total ?? initialTotal;
  const totalPages = data?.totalPages ?? 1;

  const [editingUser, setEditingUser] = React.useState<UserRecord | null>(null);
  const [adjustingUser, setAdjustingUser] = React.useState<UserRecord | null>(null);
  const [resettingPasswordUser, setResettingPasswordUser] = React.useState<UserRecord | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = React.useState<UserRecord | null>(null);
  const [restoreConfirmUser, setRestoreConfirmUser] = React.useState<UserRecord | null>(null);

  const statusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_status', userId, status }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || resData.error || 'Failed to update status');
      return resData;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: `Status set to ${vars.status}`, variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    },
  });

  const isFiltered =
    debouncedSearch !== '' ||
    roleFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    membershipFilter !== 'ALL' ||
    deletedFilter !== 'ACTIVE_ONLY';

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setMembershipFilter('ALL');
    setDeletedFilter('ACTIVE_ONLY');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Portal</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            User Management & Controls
          </h1>
          <p className="text-sm text-muted-foreground">
            Search, filter, edit accounts, adjust credit balances, reset passwords, and manage subscriptions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <UsersStatsCards stats={stats} />

      <Card>
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg">User Directory</CardTitle>
              <CardDescription>
                Showing {usersList.length} of {totalUsersCount} matching users
              </CardDescription>
            </div>

            <UsersFiltersBar
              search={search}
              onSearchChange={setSearch}
              roleFilter={roleFilter}
              onRoleChange={(v) => { setRoleFilter(v); setPage(1); }}
              statusFilter={statusFilter}
              onStatusChange={(v) => { setStatusFilter(v); setPage(1); }}
              membershipFilter={membershipFilter}
              onMembershipChange={(v) => { setMembershipFilter(v); setPage(1); }}
              deletedFilter={deletedFilter}
              onDeletedChange={(v) => { setDeletedFilter(v); setPage(1); }}
              isFiltered={isFiltered}
              onResetFilters={resetFilters}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <UsersTable
            users={usersList}
            isLoading={isLoading}
            isFiltered={isFiltered}
            onResetFilters={resetFilters}
            onEdit={(u) => setEditingUser(u)}
            onAdjustCredits={(u) => setAdjustingUser(u)}
            onResetPassword={(u) => setResettingPasswordUser(u)}
            onToggleStatus={(u) =>
              statusMutation.mutate({
                userId: u.id,
                status: u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
              })
            }
            onDelete={(u) => setDeleteConfirmUser(u)}
            onRestore={(u) => setRestoreConfirmUser(u)}
          />

          <UsersPagination
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            totalCount={totalUsersCount}
            isLoading={isLoading}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      <UserEditDialog user={editingUser} plans={plans} onClose={() => setEditingUser(null)} />
      <UserQuickCreditsDialog user={adjustingUser} onClose={() => setAdjustingUser(null)} />
      <UserQuickPasswordDialog user={resettingPasswordUser} onClose={() => setResettingPasswordUser(null)} />
      <UserQuickDeleteDialog
        deleteConfirmUser={deleteConfirmUser}
        onCloseDeleteConfirm={() => setDeleteConfirmUser(null)}
        restoreConfirmUser={restoreConfirmUser}
        onCloseRestoreConfirm={() => setRestoreConfirmUser(null)}
      />
    </div>
  );
}

