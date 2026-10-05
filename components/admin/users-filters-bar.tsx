'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface UsersFiltersBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  roleFilter: string;
  onRoleChange: (val: string) => void;
  statusFilter: string;
  onStatusChange: (val: string) => void;
  membershipFilter: string;
  onMembershipChange: (val: string) => void;
  deletedFilter: string;
  onDeletedChange: (val: string) => void;
  isFiltered: boolean;
  onResetFilters: () => void;
}

export function UsersFiltersBar({
  search,
  onSearchChange,
  roleFilter,
  onRoleChange,
  statusFilter,
  onStatusChange,
  membershipFilter,
  onMembershipChange,
  deletedFilter,
  onDeletedChange,
  isFiltered,
  onResetFilters,
}: UsersFiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name, email, or ID..."
          className="h-9 pl-8 text-xs"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select value={roleFilter} onValueChange={onRoleChange}>
        <SelectTrigger className="h-9 w-[110px] text-xs">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Roles</SelectItem>
          <SelectItem value="USER">Users</SelectItem>
          <SelectItem value="ADMIN">Admins</SelectItem>
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="h-9 w-[120px] text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Statuses</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="SUSPENDED">Suspended</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
        </SelectContent>
      </Select>

      <Select value={membershipFilter} onValueChange={onMembershipChange}>
        <SelectTrigger className="h-9 w-[125px] text-xs">
          <SelectValue placeholder="Plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Plans</SelectItem>
          <SelectItem value="FREE">Free</SelectItem>
          <SelectItem value="PRO">Pro</SelectItem>
          <SelectItem value="PLUS">Plus</SelectItem>
          <SelectItem value="AGENCY">Agency</SelectItem>
          <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
        </SelectContent>
      </Select>

      <Select value={deletedFilter} onValueChange={onDeletedChange}>
        <SelectTrigger className="h-9 w-[130px] text-xs">
          <SelectValue placeholder="Deleted" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ACTIVE_ONLY">Active Only</SelectItem>
          <SelectItem value="DELETED_ONLY">Deleted Only</SelectItem>
          <SelectItem value="ALL">All Records</SelectItem>
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={onResetFilters} className="h-9 text-xs">
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
