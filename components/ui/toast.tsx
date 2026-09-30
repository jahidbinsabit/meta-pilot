'use client';

import * as React from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

const ToastContext = React.createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const addToast = React.useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const variantIcon: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    error: <AlertCircle className="h-4 w-4 text-destructive" />,
    info: <AlertCircle className="h-4 w-4 text-sky-400" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-400" />,
  };

  return (
    <Toast.Provider swipeDirection="right">
      <ToastContext.Provider value={addToast}>
        {children}
        <Toast.Viewport className="fixed z-50 bottom-4 right-4 flex w-full max-w-sm flex-col gap-2 p-0" />
        {toasts.map((t) => (
          <Toast.Root
            key={t.id}
            duration={4000}
            onOpenChange={(open) => !open && removeToast(t.id)}
            className={cn(
              'group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-lift',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-full',
            )}
          >
            {variantIcon[t.variant]}
            <div className="flex-1">
              <Toast.Title className="text-sm font-semibold text-foreground">{t.title}</Toast.Title>
              {t.description && (
                <Toast.Description className="text-xs text-muted-foreground">
                  {t.description}
                </Toast.Description>
              )}
            </div>
            <Toast.Action altText="Dismiss" asChild>
              <button className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </Toast.Action>
          </Toast.Root>
        ))}
      </ToastContext.Provider>
    </Toast.Provider>
  );
}
