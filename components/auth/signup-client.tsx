'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Zap } from 'lucide-react';
import { GoogleIcon } from '@/components/marketing/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type Step = 'register' | 'verify';

export function SignupClient() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState<Step>('register');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/account/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ title: 'Sign up failed', description: j.error || 'try again', variant: 'error' });
        return;
      }
      toast({
        title: 'Account created',
        description: 'Check your email for the verification code.',
        variant: 'success',
      });
      setStep('verify');
    } catch {
      toast({ title: 'Sign up failed', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/account/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({
          title: 'Verification failed',
          description: j.error || 'invalid code',
          variant: 'error',
        });
        return;
      }
      toast({ title: 'Email verified', variant: 'success' });
      router.push('/login');
    } catch {
      toast({ title: 'Verification failed', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/account/verify-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) toast({ title: 'Code resent', variant: 'success' });
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch (err) {
      toast({ title: 'Sign up failed', variant: 'error' });
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Zap className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === 'register'
              ? 'Get 20 free trial credits on sign-up.'
              : 'Enter the code sent to your email.'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          {step === 'register' ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={busy}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                <GoogleIcon className="h-5 w-5" />
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  disabled={busy}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={busy}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                  disabled={busy}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>
            </form>
          ) : (
            <form onSubmit={onVerify} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We sent a verification code to{' '}
                <span className="font-medium text-foreground">{email}</span>.
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Verification code
                </label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.toUpperCase())}
                  placeholder="123456"
                  maxLength={8}
                  className="font-mono tracking-widest"
                  required
                  disabled={busy}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify email'}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={onResend}
                  disabled={busy}
                  className="text-accent hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('register');
                    setOtp('');
                  }}
                  disabled={busy}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
