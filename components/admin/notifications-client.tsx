'use client';

import * as React from 'react';
import { Bell, CalendarClock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type AdminNotification = {
  id: string;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  audience: string;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const audienceOptions = ['ALL', 'FREE', 'PRO', 'PLUS', 'AGENCY'];

const defaultForm = {
  title: '',
  body: '',
  ctaLabel: '',
  ctaUrl: '',
  audience: 'ALL',
  startsAt: '',
  endsAt: '',
  isActive: true,
};

export function NotificationsClient({
  initialNotifications,
}: {
  initialNotifications: AdminNotification[];
}) {
  const [notifications, setNotifications] = React.useState(initialNotifications);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(defaultForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resetForm = React.useCallback(() => {
    setForm(defaultForm);
    setEditingId(null);
    setError(null);
  }, []);

  const openCreate = () => {
    resetForm();
    setMode('create');
    setOpen(true);
  };

  const openEdit = (notification: AdminNotification) => {
    setMode('edit');
    setEditingId(notification.id);
    setForm({
      title: notification.title,
      body: notification.body,
      ctaLabel: notification.ctaLabel ?? '',
      ctaUrl: notification.ctaUrl ?? '',
      audience: notification.audience,
      startsAt: notification.startsAt
        ? new Date(notification.startsAt).toISOString().slice(0, 16)
        : '',
      endsAt: notification.endsAt ? new Date(notification.endsAt).toISOString().slice(0, 16) : '',
      isActive: notification.isActive,
    });
    setOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        ctaLabel: form.ctaLabel.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };

      if (!payload.title || !payload.body) {
        throw new Error('Title and body are required.');
      }

      if (mode === 'create') {
        const response = await fetch('/api/admin/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || 'Failed to create notification.');
        setNotifications((current) => [json, ...current]);
      } else if (editingId) {
        const response = await fetch(`/api/admin/notifications/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || 'Failed to update notification.');
        setNotifications((current) =>
          current.map((item) => (item.id === editingId ? { ...item, ...json } : item)),
        );
      }

      setOpen(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleNotification = async (notification: AdminNotification) => {
    const nextValue = !notification.isActive;
    const response = await fetch(`/api/admin/notifications/${notification.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextValue }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.error || 'Failed to toggle notification.');
    }
    const updated = await response.json().catch(() => ({}));
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, ...updated, isActive: nextValue } : item,
      ),
    );
  };

  const deleteNotification = async (notificationId: string) => {
    const response = await fetch(`/api/admin/notifications/${notificationId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.error || 'Failed to delete notification.');
    }
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Admin
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Broadcast updates to the dashboard, segmented by audience and plan eligibility.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Notification
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-card-2 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Audience</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr key={notification.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-foreground">{notification.title}</div>
                    <div className="mt-1 max-w-md text-xs text-muted-foreground line-clamp-2">
                      {notification.body}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge
                      variant={notification.audience === 'ALL' ? 'default' : 'info'}
                      className="uppercase"
                    >
                      {notification.audience}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant={notification.isActive ? 'success' : 'muted'}>
                      {notification.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {notification.startsAt
                        ? new Date(notification.startsAt).toLocaleString()
                        : '—'}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {notification.endsAt ? new Date(notification.endsAt).toLocaleString() : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(notification)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void toggleNotification(notification).catch((error: Error) =>
                            setError(error.message),
                          );
                        }}
                      >
                        {notification.isActive ? 'Disable' : 'Enable'}
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          void deleteNotification(notification.id).catch((error: Error) =>
                            setError(error.message),
                          );
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Create notification' : 'Edit notification'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Create a dashboard banner for admins to broadcast updates to users.'
                : 'Update the banner metadata and schedule.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-5">
            {error ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Title
                </label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  className="mt-1"
                  placeholder="Spring launch update"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Body
                </label>
                <Textarea
                  value={form.body}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, body: event.target.value }))
                  }
                  className="mt-1 min-h-[110px]"
                  placeholder="Share the important update with your audience."
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  CTA label
                </label>
                <Input
                  value={form.ctaLabel}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ctaLabel: event.target.value }))
                  }
                  className="mt-1"
                  placeholder="Learn more"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  CTA URL
                </label>
                <Input
                  value={form.ctaUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ctaUrl: event.target.value }))
                  }
                  className="mt-1"
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Audience
                </label>
                <select
                  value={form.audience}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, audience: event.target.value }))
                  }
                  className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {audienceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-center rounded-lg border border-border bg-card-2 p-3">
                <label className="flex w-full items-center justify-between gap-3 text-sm font-medium text-foreground">
                  <span>Active</span>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, isActive: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-border bg-background text-violet-500 focus:ring-violet-500"
                  />
                </label>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Starts at
                </label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Ends at
                </label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endsAt: event.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? 'Saving...' : mode === 'create' ? 'Create' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
