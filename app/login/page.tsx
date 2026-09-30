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

function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('error');
    if (!authError) return;
    if (authError === 'Configuration') {
      setError(
        'Auth is misconfigured. Set AUTH_SECRET (or NEXTAUTH_SECRET) and NEXTAUTH_URL=https://metapilot.reflecters.com in Vercel, then redeploy.',
      );
    } else if (authError === 'OAuthAccountNotLinked') {
      setError('This email is already registered. Sign in with email and password, then link Google.');
    } else if (authError === 'AccessDenied') {
      setError('Google sign-in was denied.');
    } else if (authError !== 'CredentialsSignin') {
      setError(`Sign-in failed (${authError}).`);
    }
  }, []);

  async function onCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      
      if (result?.error) {
        setError('Invalid email or password.');
        setBusy(false);
      } else if (result?.ok) {
        // Check for callbackUrl in query params
        const params = new URLSearchParams(window.location.search);
        const callbackUrl = params.get('callbackUrl') || '/dashboard';
        window.location.href = callbackUrl;
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setBusy(false);
    }
  }

  async function onResend() {
    if (busy) return;
    try {
      const res = await fetch('/api/account/verify-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) toast({ title: 'Verification code resent', variant: 'success' });
      else toast({ title: 'Could not resend', variant: 'error' });
    } catch {
      toast({ title: 'Could not resend', variant: 'error' });
    }
  }

  async function onGoogleSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch (err) {
      toast({ title: 'Sign in failed', variant: 'error' });
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
          <h1 className="mt-4 font-display text-2xl font-bold">StockForge AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your creator dashboard</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <button
            onClick={onGoogleSignIn}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-50"
          >
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onCredentials} className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
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
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                required
                disabled={busy}
              />
            </div>
            {error && (
              <p className="text-xs text-destructive">
                {error}{' '}
                {error.startsWith('Please verify') && (
                  <button type="button" onClick={onResend} className="text-accent hover:underline">
                    Resend code
                  </button>
                )}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            New here?{' '}
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

function Separator() {
  return <div className="h-px flex-1 bg-border" />;
}
