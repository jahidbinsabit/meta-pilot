'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Crown,
  Coins,
  Edit,
  Trash2,
  RotateCcw,
  CheckCircle2,
  UserCheck,
  UserX,
  Lock,
} from 'lucide-react';
import { cn, formatCredits, initials, relativeTime } from '@/lib/utils';
import type { UserRecord } from './user-types';

interface UserTableRowProps {
  user: UserRecord;
  onEdit: (user: UserRecord) => void;
  onAdjustCredits: (user: UserRecord) => void;
  onResetPassword: (user: UserRecord) => void;
  onToggleStatus: (user: UserRecord) => void;
  onDelete: (user: UserRecord) => void;
  onRestore: (user: UserRecord) => void;
}

export function UserTableRow({
  user,
  onEdit,
  onAdjustCredits,
  onResetPassword,
  onToggleStatus,
  onDelete,
  onRestore,
}: UserTableRowProps) {
  const balance = user.creditWallet?.balance ?? user.credits;
  const isSuspended = user.status === 'SUSPENDED';
  const isDeleted = !!user.deletedAt;
  const plan = user.memberships?.find((m) => m.status === 'ACTIVE')?.plan;

  return (
    <tr className={cn('hover:bg-muted/30', isDeleted && 'bg-destructive/5 opacity-75')}>
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1',
              user.role === 'ADMIN' ? 'bg-sky-500/15 text-sky-400 ring-sky-500/30' : 'bg-accent/15 text-accent ring-accent/30',
            )}
          >
            {initials(user.name || user.email)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-medium text-foreground">{user.name || 'Unnamed'}</p>
              {user.emailVerified && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
              {isDeleted && <Badge variant="destructive" className="px-1 py-0 text-[9px]">Deleted</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <Badge variant={user.role === 'ADMIN' ? 'info' : 'muted'} className="text-[11px]">
          {user.role === 'ADMIN' && <Shield className="mr-1 h-3 w-3" />}
          {user.role}
        </Badge>
      </td>

      <td className="px-3 py-3">
        <Badge variant={user.status === 'ACTIVE' ? 'success' : isSuspended ? 'destructive' : 'warning'} className="text-[11px] capitalize">
          {user.status.toLowerCase()}
        </Badge>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-col">
          <Badge variant={user.membership === 'FREE' ? 'outline' : user.membership === 'PRO' ? 'info' : 'default'} className="w-fit text-[11px]">
            {user.membership !== 'FREE' && <Crown className="mr-1 h-3 w-3" />}
            {user.membership}
          </Badge>
          {plan && plan.name !== user.membership && (
            <span className="mt-0.5 truncate text-[10px] text-muted-foreground">{plan.name}</span>
          )}
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 font-mono font-semibold text-foreground">
          <Coins className="h-3.5 w-3.5 text-amber-400" />
          <span>{formatCredits(balance)}</span>
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {user.hasGeminiKey && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">Gemini</span>}
          {user.hasOpenaiKey && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">OpenAI</span>}
          {user.hasGrokKey && <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-400">Grok</span>}
          {!user.hasGeminiKey && !user.hasOpenaiKey && !user.hasGrokKey && <span className="text-[11px] text-muted-foreground/60">—</span>}
        </div>
      </td>

      <td className="px-3 py-3 text-xs text-muted-foreground">
        <span title={new Date(user.createdAt).toLocaleString()}>{relativeTime(user.createdAt)}</span>
      </td>

      <td className="py-3 pl-3 pr-5 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="xs" onClick={() => onEdit(user)} className="h-7 px-2 text-xs">
            <Edit className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button variant="ghost" size="xs" onClick={() => onAdjustCredits(user)} className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-400">
            <Coins className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="xs" onClick={() => onResetPassword(user)} className="h-7 w-7 p-0 text-muted-foreground hover:text-sky-400">
            <Lock className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="xs" onClick={() => onToggleStatus(user)} className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-400">
            {isSuspended ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
          </Button>
          {isDeleted ? (
            <Button variant="ghost" size="xs" onClick={() => onRestore(user)} className="h-7 w-7 p-0 text-emerald-400">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="xs" onClick={() => onDelete(user)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
