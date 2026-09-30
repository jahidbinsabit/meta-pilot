import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

interface SeparatorProps extends React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> {
  label?: string;
}

const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  SeparatorProps
>(({ className, orientation = 'horizontal', label, ...props }, ref) => {
  if (!label) {
    return (
      <SeparatorPrimitive.Root
        ref={ref}
        orientation={orientation}
        className={cn(
          'shrink-0 bg-border',
          orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground',
        orientation === 'horizontal' ? 'w-full' : 'flex-col',
      )}
    >
      <SeparatorPrimitive.Root
        orientation={orientation}
        className={cn(
          'shrink-0 bg-border',
          orientation === 'horizontal' ? 'h-[1px] flex-1' : 'w-[1px] flex-1',
        )}
      />
      <span className="px-1">{label}</span>
      <SeparatorPrimitive.Root
        orientation={orientation}
        className={cn(
          'shrink-0 bg-border',
          orientation === 'horizontal' ? 'h-[1px] flex-1' : 'w-[1px] flex-1',
        )}
      />
    </div>
  );
});
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
