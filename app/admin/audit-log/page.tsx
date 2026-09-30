import { prisma } from '@/lib/db';
import Link from 'next/link';
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JsonDiff } from './json-diff';

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { page?: string; adminId?: string; action?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page || '1') || 1);
  const adminId = searchParams.adminId?.trim() || undefined;
  const action = searchParams.action?.trim() || undefined;

  const where: { adminId?: string; action?: { contains: string } } = {};
  if (adminId) where.adminId = adminId;
  if (action) where.action = { contains: action };

  const [logs, total, admins] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const adminMap = new Map(admins.map((a) => [a.id, a]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const adminOptions = admins;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Audit Log
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Audit Log</h1>
        </div>
        <ClipboardList className="h-6 w-6 text-muted-foreground" />
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label
            htmlFor="adminId"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Admin
          </label>
          <select
            id="adminId"
            name="adminId"
            defaultValue={adminId || ''}
            className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All admins</option>
            {adminOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label
            htmlFor="action"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Action
          </label>
          <input
            id="action"
            name="action"
            defaultValue={action || ''}
            placeholder="e.g., UPDATE, CREATE"
            className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="submit">Filter</Button>
        {(adminId || action) && (
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/audit-log">Clear</Link>
          </Button>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-sidebar/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target Type</th>
              <th className="px-4 py-3">Target ID</th>
              <th className="px-4 py-3">Diff</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const admin = adminMap.get(log.adminId);
                return (
                  <tr key={log.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {admin ? (
                        <div>
                          <p className="font-medium">{admin.name || admin.email}</p>
                          <p className="text-xs text-muted-foreground">{admin.email}</p>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {log.adminId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded-md bg-accent/15 px-2 py-1 text-xs font-medium text-accent">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {log.targetType}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {log.targetId}
                    </td>
                    <td className="px-4 py-3 max-w-md space-y-1">
                      <JsonDiff value={log.before} label="before" />
                      <JsonDiff value={log.after} label="after" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages} · {total.toLocaleString()} entries
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
            {page > 1 ? (
              <Link
                href={`/admin/audit-log?${new URLSearchParams({ page: String(page - 1), ...(adminId ? { adminId } : {}), ...(action ? { action } : {}) }).toString()}`}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Link>
            ) : (
              <span>
                <ChevronLeft className="h-4 w-4" /> Prev
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            asChild={page < totalPages}
          >
            {page < totalPages ? (
              <Link
                href={`/admin/audit-log?${new URLSearchParams({ page: String(page + 1), ...(adminId ? { adminId } : {}), ...(action ? { action } : {}) }).toString()}`}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                Next <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
