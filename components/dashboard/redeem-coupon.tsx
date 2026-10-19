'use client';

import * as React from 'react';
import { Ticket, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function RedeemCoupon() {
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch('/api/coupons/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.toUpperCase().trim() }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ ok: true, text: `+${json.credits} credits added! New balance: ${json.balance}` });
        setCode('');
        // Refresh credit displays
        window.dispatchEvent(new CustomEvent('credits-updated'));
      } else {
        const friendly: Record<string, string> = {
          invalid_code: 'This code is not valid.',
          expired_code: 'This code has expired.',
          code_exhausted: 'This code has reached its usage limit.',
          already_redeemed: 'You have already redeemed this code.',
        };
        setMessage({ ok: false, text: friendly[json.error] || 'Could not redeem this code.' });
      }
    } catch {
      setMessage({ ok: false, text: 'Something went wrong. Try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-accent" /> Redeem coupon
        </CardTitle>
        <CardDescription>Have a promo code? Enter it to add credits to your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRedeem} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
            className="max-w-xs font-mono uppercase"
          />
          <Button type="submit" disabled={loading || !code.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Redeem'}
          </Button>
        </form>
        {message && (
          <p
            className={`mt-3 flex items-center gap-1.5 text-sm ${
              message.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'
            }`}
          >
            {message.ok && <CheckCircle2 className="h-4 w-4" />}
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
