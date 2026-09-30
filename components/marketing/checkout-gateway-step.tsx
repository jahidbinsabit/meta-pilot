'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { gatewayIcon, gatewaysForCurrency, type CheckoutCurrency } from './checkout-helpers';
import { type PublicGateway } from '@/lib/payments/public';

export function GatewayStep({
  currency,
  formattedAmount,
  gateways,
  busy,
  onSelect,
  onBack,
}: {
  currency: CheckoutCurrency;
  formattedAmount: string;
  gateways: PublicGateway[];
  busy: boolean;
  onSelect: (g: PublicGateway) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Amount due</p>
        <p className="mt-1 text-2xl font-bold">{formattedAmount}</p>
        <p className="text-xs text-muted-foreground">
          {currency === 'USD' ? 'International payment methods' : 'Bangladesh payment gateways'}
        </p>
      </div>
      <div className="space-y-2">
        {gateways.length === 0 && (
          <p className="text-sm text-muted-foreground">No {currency} payment methods are configured yet.</p>
        )}
        {gateways.map((gateway) => {
          const Icon = gatewayIcon(gateway.gatewayKey);
          return (
            <button
              key={gateway.gatewayKey}
              type="button"
              disabled={busy}
              onClick={() => onSelect(gateway)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent/10',
                !gateway.isEnabled && 'opacity-60',
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{gateway.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {gateway.isManual ? 'Manual verification' : 'Instant international checkout'}
                  {!gateway.isEnabled ? ' · Coming soon' : ''}
                </p>
              </div>
              <Check className="h-4 w-4 text-muted-foreground" />
            </button>
          );
        })}
      </div>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Back to currency
      </Button>
    </div>
  );
}
