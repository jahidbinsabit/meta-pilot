'use client';

import * as React from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DecryptedGatewayConfig } from '@/lib/payments/config';

interface GatewayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gateway: DecryptedGatewayConfig | null;
  onSave: (data: any) => Promise<void>;
  busy?: boolean;
}

export function PaymentGatewayModal({
  open,
  onOpenChange,
  gateway,
  onSave,
  busy,
}: GatewayModalProps) {
  const isNew = !gateway?.id;
  const [displayName, setDisplayName] = React.useState('');
  const [gatewayKey, setGatewayKey] = React.useState('');
  const [isEnabled, setIsEnabled] = React.useState(false);
  const [isManual, setIsManual] = React.useState(true);
  const [sortOrder, setSortOrder] = React.useState(0);
  const [credentials, setCredentials] = React.useState<Record<string, any>>({});
  const [showSecrets, setShowSecrets] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (open) {
      if (gateway) {
        setDisplayName(gateway.displayName || '');
        setGatewayKey(gateway.gatewayKey || '');
        setIsEnabled(gateway.isEnabled ?? false);
        setIsManual(gateway.isManual ?? false);
        setSortOrder(gateway.sortOrder ?? 0);
        setCredentials(gateway.credentials || {});
      } else {
        setDisplayName('');
        setGatewayKey('');
        setIsEnabled(true);
        setIsManual(true);
        setSortOrder(0);
        setCredentials({
          accountType: 'Personal',
          receivingNumber: '',
          instructions: '',
          currency: 'BDT',
        });
      }
      setShowSecrets({});
    }
  }, [open, gateway]);

  const updateCred = (field: string, val: any) => {
    setCredentials((prev) => ({ ...prev, [field]: val }));
  };

  const toggleSecret = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const isStripe = gatewayKey.toLowerCase().includes('stripe');
  const isBkashOrNagad =
    gatewayKey.toLowerCase().includes('bkash') || gatewayKey.toLowerCase().includes('nagad');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      id: gateway?.id,
      gatewayKey: gatewayKey.trim().toLowerCase(),
      displayName: displayName.trim(),
      isEnabled,
      isManual,
      sortOrder: Number(sortOrder) || 0,
      credentials,
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isNew ? 'Add Payment Gateway' : `Configure ${displayName || 'Gateway'}`}
            </DialogTitle>
            <DialogDescription>
              Set gateway status, credentials, receiving account details, and payment instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 px-1">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
              <div>
                <Label className="text-base font-semibold">Enable Gateway</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, users will see this option on checkout and billing.
                </p>
              </div>
              <Toggle checked={isEnabled} onChange={setIsEnabled} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. bKash, Nagad, Stripe, Bank Transfer"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="gatewayKey">Gateway Key</Label>
                <Input
                  id="gatewayKey"
                  value={gatewayKey}
                  onChange={(e) => setGatewayKey(e.target.value)}
                  placeholder="e.g. bkash_manual, stripe, bank_manual"
                  disabled={!isNew}
                  required
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Manual Gateway</Label>
                  <p className="text-[11px] text-muted-foreground">TrxID & phone verification</p>
                </div>
                <Toggle checked={isManual} onChange={setIsManual} />
              </div>
              <div>
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            </div>
            {/* Dynamic Credentials Section */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                {isStripe
                  ? 'Stripe API Credentials'
                  : isManual
                    ? 'Account Details & Instructions'
                    : 'Gateway Credentials'}
              </h4>

              {isStripe ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="stripe-publishable">Publishable Key</Label>
                    <Input
                      id="stripe-publishable"
                      value={credentials.publishableKey || ''}
                      onChange={(e) => updateCred('publishableKey', e.target.value)}
                      placeholder="pk_test_... or pk_live_..."
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="stripe-secret">Secret Key</Label>
                      <button
                        type="button"
                        onClick={() => toggleSecret('secretKey')}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {showSecrets['secretKey'] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        {showSecrets['secretKey'] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <Input
                      id="stripe-secret"
                      type={showSecrets['secretKey'] ? 'text' : 'password'}
                      value={credentials.secretKey || ''}
                      onChange={(e) => updateCred('secretKey', e.target.value)}
                      placeholder="sk_test_... or sk_live_..."
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="stripe-webhook">Webhook Secret</Label>
                      <button
                        type="button"
                        onClick={() => toggleSecret('webhookSecret')}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {showSecrets['webhookSecret'] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        {showSecrets['webhookSecret'] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <Input
                      id="stripe-webhook"
                      type={showSecrets['webhookSecret'] ? 'text' : 'password'}
                      value={credentials.webhookSecret || ''}
                      onChange={(e) => updateCred('webhookSecret', e.target.value)}
                      placeholder="whsec_..."
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="accountType">Account Type</Label>
                      <select
                        id="accountType"
                        value={credentials.accountType || 'Personal'}
                        onChange={(e) => updateCred('accountType', e.target.value)}
                        className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="Personal">Personal / Send Money</option>
                        <option value="Merchant">Merchant / Payment</option>
                        <option value="Agent">Agent / Cash Out</option>
                        <option value="Bank">Bank Account</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="receivingNumber">Receiving Number / Account</Label>
                      <Input
                        id="receivingNumber"
                        value={credentials.receivingNumber || credentials.merchantNumber || ''}
                        onChange={(e) => updateCred('receivingNumber', e.target.value)}
                        placeholder="e.g. 017XXXXXXXX or Account No"
                        className="mt-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                  {credentials.accountType === 'Bank' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="bankName">Bank Name</Label>
                        <Input
                          id="bankName"
                          value={credentials.bankName || ''}
                          onChange={(e) => updateCred('bankName', e.target.value)}
                          placeholder="e.g. City Bank, BRAC Bank"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="accountName">Account Name</Label>
                        <Input
                          id="accountName"
                          value={credentials.accountName || ''}
                          onChange={(e) => updateCred('accountName', e.target.value)}
                          placeholder="Account Holder Name"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="instructions">Payment Instructions for User</Label>
                    <Textarea
                      id="instructions"
                      rows={3}
                      value={credentials.instructions || ''}
                      onChange={(e) => updateCred('instructions', e.target.value)}
                      placeholder="e.g. Send Money (Personal) to 017XXXXXXXX with Reference, then enter your sender number & TrxID below."
                      className="mt-1 text-xs"
                    />
                  </div>

                  {isBkashOrNagad && !isManual && (
                    <div className="pt-2 border-t border-border/60 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        Automated Gateway API Credentials
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">App Key</Label>
                          <Input
                            value={credentials.appKey || ''}
                            onChange={(e) => updateCred('appKey', e.target.value)}
                            className="text-xs font-mono"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">App Password</Label>
                          <Input
                            type="password"
                            value={credentials.appPassword || ''}
                            onChange={(e) => updateCred('appPassword', e.target.value)}
                            className="text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

          </div>
          <DialogFooter className="gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {isNew ? 'Add Gateway' : 'Save Changes'}
            </Button>
          </DialogFooter>

        </form>
      </DialogContent>
    </Dialog>
  );
}

