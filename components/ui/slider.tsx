'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  label?: string;
  showBadge?: boolean;
  formatValue?: (v: number) => string;
}

const Slider = React.forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, label, showBadge = true, formatValue, value, ...props }, ref) => {
    const val = Array.isArray(value) ? value[0] : (value ?? props.defaultValue?.[0] ?? 0);
    const pct = ((val - (props.min ?? 0)) / ((props.max ?? 100) - (props.min ?? 0))) * 100;

    return (
      <div className={cn('w-full', className)}>
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          )}
          {showBadge && (
            <span className="text-xs font-mono font-medium text-foreground">
              {formatValue ? formatValue(val) : val}
            </span>
          )}
        </div>
        <SliderPrimitive.Root
          ref={ref}
          value={value}
          className={cn('relative flex w-full touch-none select-none items-center py-2', className)}
          {...props}
        >
          <span
            className="pointer-events-none absolute overflow-hidden rounded-full slider-track"
            style={{ ['--slider-pct' as string]: `${pct}%` }}
          />
          <SliderPrimitive.Thumb
            className="block h-4 w-4 rounded-full border-2 border-background bg-accent shadow-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
            aria-label={label || 'slider'}
          />
        </SliderPrimitive.Root>
      </div>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
