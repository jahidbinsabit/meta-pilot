'use client';

import * as React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import type { TrendPoint } from '@/lib/adobe-analytics/types';
import { trendDirection } from '@/lib/adobe-analytics/trend';

// Validated for the app's dark card surface (#0f0f11): passes the lightness
// band, chroma floor, and >= 3:1 contrast checks.
const SERIES = '#3987e5';

const DIRECTION_COPY = {
  up: { label: 'New-heavy', variant: 'success' as const },
  down: { label: 'Older-heavy', variant: 'warning' as const },
  flat: { label: 'Even spread', variant: 'muted' as const },
};

interface Props {
  points: TrendPoint[];
  basis: string;
  source: 'adobe' | 'estimated';
  query: string;
}

export function InterestChart({ points, basis, source, query }: Props) {
  const [showBasis, setShowBasis] = React.useState(false);
  const direction = trendDirection(points);

  if (!points.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Catalogue recency
            <Badge variant="warning" className="text-[10px]">
              Estimated
            </Badge>
          </CardTitle>
          <CardDescription>Recency mix for &ldquo;{query}&rdquo;</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{basis}</p>
        </CardContent>
      </Card>
    );
  }

  const dir = DIRECTION_COPY[direction];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              Catalogue recency
              {source === 'estimated' && (
                <Badge variant="warning" className="text-[10px]">
                  Estimated
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              How recent the &ldquo;{query}&rdquo; matches are, newest first
            </CardDescription>
          </div>
          <Badge variant={dir.variant} className="text-[10px]">
            {dir.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
                formatter={(v: number) => [`${v}% of results`, 'Share']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Line
                type="monotone"
                dataKey="interest"
                stroke={SERIES}
                strokeWidth={2}
                dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: SERIES, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Adobe Stock&rsquo;s API does not publish publish-dates, per-asset download counts, or
          search-volume history. This chart shows the recency mix of the assets Adobe returned — it
          is not a download trend.
        </p>

        <div className="mt-3 rounded-lg border border-border bg-card-2 p-3">
          <button
            type="button"
            onClick={() => setShowBasis((v) => !v)}
            className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showBasis}
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            How is this derived?
          </button>
          {showBasis && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{basis}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
