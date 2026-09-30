'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Clock,
  Bell,
  Download,
  FileJson,
} from 'lucide-react';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';

interface Event {
  id: string;
  title: string;
  date: string; // ISO date
  type: 'reminder' | 'deadline' | 'seasonal';
  note: string;
}

const TYPE_LABEL: Record<Event['type'], string> = {
  reminder: 'Reminder',
  deadline: 'Deadline',
  seasonal: 'Seasonal',
};

const TYPE_VARIANT: Record<
  Event['type'],
  'default' | 'secondary' | 'info' | 'warning' | 'success' | 'destructive' | 'muted'
> = {
  reminder: 'info',
  deadline: 'destructive',
  seasonal: 'success',
};

export function EventsClient({ tool }: { tool: ToolEntry }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState('');
  const [type, setType] = React.useState<Event['type']>('reminder');
  const [note, setNote] = React.useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  // Persist events in localStorage so they survive reloads.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('stockforge:events');
      if (saved) setEvents(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('stockforge:events', JSON.stringify(events));
    } catch {
      /* ignore */
    }
  }, [events]);

  const addEvent = () => {
    if (!title.trim() || !date) {
      toast({ title: 'Title and date required', variant: 'error' });
      return;
    }
    setEvents((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: title.trim(),
        date,
        type,
        note: note.trim(),
      },
    ]);
    setTitle('');
    setDate('');
    setNote('');
    toast({ title: 'Event added', variant: 'success' });
  };

  const removeEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'events.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', variant: 'success' });
  };

  const sorted = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <ToolShell tool={tool}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New event</CardTitle>
            <CardDescription>Add a reminder, deadline, or seasonal note.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Title
              </label>
              <Input
                placeholder="e.g. Shoot winter collection"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Event['type'])}
                className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
              >
                <option value="reminder">Reminder</option>
                <option value="deadline">Deadline</option>
                <option value="seasonal">Seasonal</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Note
              </label>
              <Textarea
                placeholder="Optional context…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 min-h-[80px]"
              />
            </div>
            <Button onClick={addEvent} className="w-full">
              <Plus className="h-4 w-4" />
              Add event
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Calendar</CardTitle>
                <CardDescription>
                  {events.length} event{events.length === 1 ? '' : 's'} · user-managed
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportJson}
                disabled={events.length === 0}
              >
                <FileJson className="h-4 w-4" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <CalendarIcon className="h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">No events yet.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {sorted.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card-2 p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <span className="text-[10px] font-semibold uppercase">
                        {new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, {
                          month: 'short',
                        })}
                      </span>
                      <span className="text-sm font-bold leading-none">
                        {new Date(e.date + 'T00:00:00').getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {e.title}
                        </span>
                        <Badge variant={TYPE_VARIANT[e.type]} className="text-[10px]">
                          {TYPE_LABEL[e.type]}
                        </Badge>
                      </div>
                      {e.note && <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEvent(e.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${e.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
