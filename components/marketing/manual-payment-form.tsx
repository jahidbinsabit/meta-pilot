'use client';

import * as React from 'react';
import { 
  Loader2, 
  Send, 
  Hash, 
  Phone, 
  Copy, 
  Check, 
  HelpCircle,
  ArrowLeft,
  Smartphone,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PublicGateway } from '@/lib/payments/public';

interface ManualPaymentFormProps {
  gateway: PublicGateway;
  formattedAmount: string;
  senderNumber: string;
  setSenderNumber: (v: string) => void;
  transactionId: string;
  setTransactionId: (v: string) => void;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function ManualPaymentForm({
  gateway,
  formattedAmount,
  senderNumber,
  setSenderNumber,
  transactionId,
  setTransactionId,
  busy,
  onBack,
  onSubmit,
}: ManualPaymentFormProps) {
  const [copiedNumber, setCopiedNumber] = React.useState(false);
  const [copiedAmount, setCopiedAmount] = React.useState(false);

  const gatewayKey = gateway.gatewayKey.toLowerCase();
  const isBkash = gatewayKey.includes('bkash');
  const isNagad = gatewayKey.includes('nagad');
  const isRocket = gatewayKey.includes('rocket');

  const providerName = isBkash 
    ? 'bKash' 
    : isNagad 
      ? 'Nagad' 
      : isRocket 
        ? 'Rocket' 
        : gateway.displayName;

  const ussdCode = isBkash 
    ? '*247#' 
    : isNagad 
      ? '*167#' 
      : isRocket 
        ? '*322#' 
        : '';

  const isMerchant = gateway.accountType?.toLowerCase() === 'merchant';
  const cleanAmountNumber = formattedAmount.replace(/[^\d.]/g, '');

  const handleCopyNumber = () => {
    if (!gateway.receivingNumber) return;
    navigator.clipboard.writeText(gateway.receivingNumber);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleCopyAmount = () => {
    if (!cleanAmountNumber) return;
    navigator.clipboard.writeText(cleanAmountNumber);
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const isFormValid = senderNumber.trim().length >= 8 && transactionId.trim().length >= 4;

  return (
    <div className="space-y-3.5 text-left">
      {/* Top Compact Card: Recipient & Amount Info */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-accent/5 p-3.5 shadow-sm">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
          {/* Recipient Details */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold shadow-sm",
              isBkash ? "bg-[#e2136e]/15 text-[#e2136e] dark:bg-[#e2136e]/25" :
              isNagad ? "bg-[#f7941d]/15 text-[#f7941d] dark:bg-[#f7941d]/25" :
              isRocket ? "bg-[#8c3494]/15 text-[#8c3494] dark:bg-[#8c3494]/25" :
              "bg-primary/15 text-primary"
            )}>
              <Smartphone className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-foreground">
                  {providerName}
                </span>
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {gateway.accountType || (isMerchant ? 'Merchant' : 'Personal')}
                </span>
              </div>
              
              {gateway.receivingNumber ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-sm font-bold tracking-wide text-foreground">
                    {gateway.receivingNumber}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyNumber}
                    title="Copy Number"
                    className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {copiedNumber ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Manual Number</p>
              )}
            </div>
          </div>

          {/* Amount Due */}
          <div className="flex sm:flex-col items-baseline sm:items-end justify-between w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
            <span className="text-[11px] font-medium text-muted-foreground">
              পরিমাণ (Amount)
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-primary">
                {formattedAmount}
              </span>
              <button
                type="button"
                onClick={handleCopyAmount}
                title="Copy Amount"
                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {copiedAmount ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step-by-Step Instructions */}
      <div className="rounded-xl border border-border bg-card/80 p-3 sm:p-3.5 shadow-sm space-y-2">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              নির্দেশাবলী (Instructions)
            </h4>
          </div>
          {ussdCode && (
            <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
              USSD: {ussdCode}
            </span>
          )}
        </div>

        <ol className="space-y-1.5 text-xs text-muted-foreground leading-snug">
          <li className="flex items-start gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary mt-0.5">
              ১
            </span>
            <span>
              {ussdCode ? <strong className="text-foreground">{ussdCode}</strong> : null} ডায়াল করে অথবা <strong className="text-foreground">{providerName} অ্যাপ</strong>-এ যান।
            </span>
          </li>

          <li className="flex items-start gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary mt-0.5">
              ২
            </span>
            <span>
              <strong className="text-foreground">"{isMerchant ? 'Payment' : 'Send Money'}"</strong> অপশন সিলেক্ট করুন।
            </span>
          </li>

          <li className="flex items-start gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary mt-0.5">
              ৩
            </span>
            <span>
              প্রাপক নম্বর হিসেবে <strong className="font-mono text-foreground font-semibold">{gateway.receivingNumber || 'উপরের নম্বরটি'}</strong> লিখুন।
            </span>
          </li>

          <li className="flex items-start gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary mt-0.5">
              ৪
            </span>
            <span>
              পরিমাণ <strong className="text-foreground font-semibold">{formattedAmount}</strong> টাকা দিয়ে পিন কনফার্ম করুন।
            </span>
          </li>

          <li className="flex items-start gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary mt-0.5">
              ৫
            </span>
            <span>
              নিচের ফর্মে প্রেরক নম্বর ও <strong className="text-foreground font-semibold">Transaction ID</strong> দিয়ে সাবমিট করুন।
            </span>
          </li>
        </ol>

        {gateway.instructions && (
          <p className="mt-1 text-[11px] text-muted-foreground bg-muted/50 rounded p-1.5 border border-border/40">
            <strong>নোট:</strong> {gateway.instructions}
          </p>
        )}
      </div>

      {/* Input Form Fields (2 columns on tablet/desktop, stacked on mobile) */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-3.5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Sender Number Field */}
          <div className="space-y-1">
            <Label htmlFor="sender-number" className="text-[11px] font-semibold text-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-primary" />
                আপনার {providerName} নম্বর
              </span>
              <span className="text-[9px] text-muted-foreground">আবশ্যক</span>
            </Label>
            <Input
              id="sender-number"
              type="tel"
              value={senderNumber}
              onChange={(e) => setSenderNumber(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="h-9 text-xs font-mono placeholder:font-sans"
              disabled={busy}
              autoComplete="tel"
            />
          </div>

          {/* Transaction ID Field */}
          <div className="space-y-1">
            <Label htmlFor="trx-id" className="text-[11px] font-semibold text-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3 text-primary" />
                Transaction ID (TrxID)
              </span>
              <span className="text-[9px] text-muted-foreground">আবশ্যক</span>
            </Label>
            <Input
              id="trx-id"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
              placeholder="e.g. BKD918XA"
              className="h-9 text-xs font-mono uppercase placeholder:normal-case"
              disabled={busy}
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      {/* Verification Notice Banner */}
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span className="leading-tight">
          <strong>নোট:</strong> TrxID সাবমিট করার পর ম্যানুয়ালি ভেরিফাই করে দ্রুত ক্রেডিট যোগ করা হবে।
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          type="button"
          variant="outline"
          className="h-9.5 flex-1 gap-1 text-xs font-medium"
          onClick={onBack}
          disabled={busy}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          পূর্ববর্তী
        </Button>

        <Button
          type="button"
          className="h-9.5 flex-[1.4] gap-1.5 text-xs font-semibold shadow-md shadow-primary/20"
          onClick={onSubmit}
          disabled={busy || !isFormValid}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>যাচাই হচ্ছে...</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>পেমেন্ট সাবমিট করুন</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
