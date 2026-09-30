'use client';

import * as React from 'react';
import { Copy, Check, CheckCircle2, XCircle, Clock, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PaymentDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: any | null;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  busy?: boolean;
}

export function PaymentDetailsModal({
  open,
  onOpenChange,
  payment,
  onApprove,
  onReject,
  busy,
}: PaymentDetailsModalProps) {
  const [copied, setCopied] = React.useState(false);

  if (!payment) return null;

  const copyTrx = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const payload =
    payment.gatewayPayload && typeof payment.gatewayPayload === 'object'
      ? (payment.gatewayPayload as Record<string, any>)
      : {};

  const senderNumber = payload.senderNumber || 'N/A';
  const planName =
    payload.planName || (payment.planIdOrCreditPackageId ? 'Plan / Package' : 'Custom Credits');
  const credits = payload.credits ? `${payload.credits} Credits` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>Payment Details</DialogTitle>
            <Badge
              variant={
                payment.status === 'COMPLETED'
                  ? 'success'
                  : payment.status === 'REJECTED'
                    ? 'destructive'
                    : 'warning'
              }
            >
              {payment.status}
            </Badge>
          </div>
          <DialogDescription>
            Reference ID: <span className="font-mono text-xs">{payment.id}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 text-sm">
          <div className="rounded-lg border border-border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
              <User className="h-3.5 w-3.5" /> Customer Information
            </div>
            <p className="font-medium text-foreground">{payment.user?.name || 'Anonymous User'}</p>
            <p className="text-xs text-muted-foreground font-mono">{payment.user?.email || 'No email'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3">
              <span className="text-xs text-muted-foreground">Amount</span>
              <p className="text-lg font-bold text-foreground">
                {payment.amountBDT > 0 ? `৳${payment.amountBDT.toLocaleString()}` : ''}
                {payment.amountBDT > 0 && payment.amountUSD > 0 ? ' / ' : ''}
                {payment.amountUSD > 0 ? `$${payment.amountUSD.toFixed(2)}` : ''}
                {payment.amountBDT === 0 && payment.amountUSD === 0 ? 'Free / $0' : ''}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <span className="text-xs text-muted-foreground">Purchased Item</span>
              <p className="text-sm font-semibold text-foreground">{planName}</p>
              {credits && <p className="text-xs text-accent font-medium">{credits}</p>}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Method / Provider:</span>
              <Badge variant="outline" className="font-mono text-xs capitalize">
                {payment.method.toLowerCase().replace('_', ' ')}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sender Number / Account:</span>
              <span className="font-mono text-xs font-semibold">{senderNumber}</span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Transaction Ref / ID:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-accent">
                  {payment.transactionRef || 'N/A'}
                </span>
                {payment.transactionRef && (
                  <button
                    onClick={() => copyTrx(payment.transactionRef)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Copy TrxID"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground rounded-lg bg-muted/40 p-3">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Created at: {new Date(payment.createdAt).toLocaleString()}</span>
            </div>
            {payment.reviewedAt && (
              <div className="flex items-center gap-1.5 pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                <span>Reviewed at: {new Date(payment.reviewedAt).toLocaleString()}</span>
              </div>
            )}
            {payload.notes && (
              <div className="pt-2 text-foreground">
                <span className="font-semibold text-xs text-muted-foreground">Admin Notes: </span>
                <span>{payload.notes}</span>
              </div>
            )}
            {payload.rejectionReason && (
              <div className="pt-2 text-destructive">
                <span className="font-semibold">Rejection Reason: </span>
                <span>{payload.rejectionReason}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3 border-t border-border">
          {payment.status === 'PENDING' && onReject && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onReject(payment.id)}
              disabled={busy}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject Payment
            </Button>
          )}
          {payment.status === 'PENDING' && onApprove && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onApprove(payment.id)}
              disabled={busy}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Approve & Fulfill
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
