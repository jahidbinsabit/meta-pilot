'use client';

import * as React from 'react';
import { Trash2, Download, FileText, Wrench, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Item = {
  kind: 'metadata' | 'tool';
  id: string;
  title: string;
  subtitle: string;
  provider: string | null;
  model: string | null;
  fileName: string | null;
  createdAt: string;
  data: any;
};

function downloadJson(item: Item) {
  const blob = new Blob([JSON.stringify(item.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${item.kind}-${item.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function LibraryClient() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [type, setType] = React.useState<'all' | 'metadata' | 'tools'>('all');
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const fetchPage = React.useCallback(async (p: number, t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library?page=${p}&take=20&type=${t}`);
      const json = await res.json();
      setItems(json.items || []);
      setTotalPages(json.totalPages || 1);
      setTotal(json.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPage(page, type);
  }, [page, type, fetchPage]);

  const handleDelete = async (item: Item) => {
    if (!confirm('Delete this item from your library?')) return;
    setDeleting(item.id);
    try {
      const res = await fetch('/api/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, kind: item.kind }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setTotal((t) => t - 1);
      }
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Dashboard</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your past generations — {total} item{total === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex gap-2">
        {(['all', 'metadata', 'tools'] as const).map((t) => (
          <Button
            key={t}
            variant={type === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setType(t);
              setPage(1);
            }}
          >
            {t === 'all' ? 'All' : t === 'metadata' ? 'Metadata' : 'Tools'}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 font-medium">No generations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your past metadata and tool outputs will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={`${item.kind}-${item.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                      {item.kind === 'metadata' ? (
                        <FileText className="h-5 w-5 text-accent" />
                      ) : (
                        <Wrench className="h-5 w-5 text-accent" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {item.kind === 'metadata' ? 'Metadata' : 'Tool'}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => downloadJson(item)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item)}
                      disabled={deleting === item.id}
                    >
                      {deleting === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
