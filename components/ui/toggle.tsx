'use client';

import * as React from 'react';
import * as Switch from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

interface ToggleProps extends Omit<React.ComponentPropsWithoutRef<typeof Switch.Root>, 'onChange'> {
  label?: string;
  description?: string;
  onChange?: (checked: boolean) => void;
}

const Toggle = React.forwardRef<React.ComponentRef<typeof Switch.Root>, ToggleProps>(
  ({ label, description, id, checked, onChange, ...props }, ref) => {
    const generatedId = React.useId();
    const toggleId = id || generatedId;
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          {label && (
            <label
              htmlFor={toggleId}
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              {label}
            </label>
          )}
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </div>
        <Switch.Root
          ref={ref}
          id={toggleId}
          checked={checked}
          onCheckedChange={onChange}
          className={cn(
            'toggle relative inline-flex h-6 w-11 items-center rounded-full border border-border bg-muted',
            'data-[state=checked]:bg-accent data-[state=checked]:border-transparent',
          )}
          {...props}
        >
          <Switch.Thumb
            className={cn(
              'block h-4 w-4 rounded-full bg-white transition-transform',
              'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5',
            )}
          />
        </Switch.Root>
      </div>
    );
  },
);
Toggle.displayName = 'Toggle';

export { Toggle };
