'use client';

import * as React from 'react';

export function JsonDiff({ value, label }: { value: unknown; label: string }) {
  const [open, setOpen] = React.useState(false);
  
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  
  const json = JSON.stringify(value, null, 2);
  const preview = json.length > 60 ? json.slice(0, 60) + '…' : json;
  
  return (
    <details open={open} onToggle={(e) => setOpen((e as any).target.open)} className="text-xs">
      <summary className="cursor-pointer text-accent hover:underline">
        {label}: {preview}
      </summary>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-tight">
          {json}
        </pre>
      )}
    </details>
  );
}
