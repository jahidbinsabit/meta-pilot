"use client";

import * as React from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { GoogleColorIcon } from "@/components/auth/google-icon";

export function LoginForm() {
  const toast = useToast();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [googleBusy, setGoogleBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (!authError) return;
    if (authError === "Configuration") setError("Auth configuration notice: verify AUTH_SECRET and NEXTAUTH_URL.");
    else if (authError === "OAuthAccountNotLinked") setError("This email is already registered. Sign in with password first.");
    else if (authError === "AccessDenied") setError("Google sign-in was canceled.");
    else if (authError !== "CredentialsSignin") setError(`Sign-in failed (${authError}).`);
  }, []);

  async function onCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (busy || googleBusy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Invalid email or password. Please check your credentials.");
        setBusy(false);
      } else if (result?.ok) {
        const params = new URLSearchParams(window.location.search);
        window.location.href = params.get("callbackUrl") || "/dashboard";
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setBusy(false);
    }
  }

  async function onResend() {
    if (busy || !email) return;
    try {
      const res = await fetch("/api/account/verify-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) toast({ title: "Verification code resent", description: "Please check your inbox.", variant: "success" });
      else toast({ title: "Could not resend code", variant: "error" });
    } catch {
      toast({ title: "Could not resend code", variant: "error" });
    }
  }

  async function onGoogleSignIn() {
    if (busy || googleBusy) return;
    setGoogleBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      await signIn("google", { callbackUrl: params.get("callbackUrl") || "/dashboard" });
    } catch {
      toast({ title: "Google sign-in failed", variant: "error" });
      setGoogleBusy(false);
    }
  }

  return (
    <div className="my-auto py-8">
      <div className="max-w-md">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sign in to generate SEO metadata, analyze Adobe Stock downloads, and export batch CSVs.
          </p>
        </div>

        {/* Google OAuth Button */}
        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={busy || googleBusy}
            className="relative flex w-full items-center justify-center gap-3.5 rounded-xl border border-border bg-card/80 px-4 py-3 text-sm font-medium text-foreground shadow-sm hover:border-accent/40 hover:bg-card active:scale-[0.99] disabled:opacity-50 transition-all"
          >
            {googleBusy ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : <GoogleColorIcon className="h-5 w-5" />}
            <span>Continue with Google</span>
          </button>
          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-border/80" />
            <span className="absolute bg-background px-3 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              Or sign in with email
            </span>
          </div>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span>{error}</span>
              {error.toLowerCase().includes("verify") && (
                <button type="button" onClick={onResend} className="ml-2 font-semibold text-accent underline hover:opacity-80">
                  Resend code
                </button>
              )}
            </div>
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={onCredentials} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/90">Email address</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
                <Mail className="h-4 w-4" />
              </div>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="name@company.com"
                required
                disabled={busy || googleBusy}
                className="h-11 rounded-xl border-border bg-card/60 pl-10 text-sm focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground/90">Password</label>
              <Link href="/signup" className="text-2xs font-medium text-accent hover:underline">
                Need help?
              </Link>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
                <Lock className="h-4 w-4" />
              </div>
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="••••••••"
                required
                disabled={busy || googleBusy}
                className="h-11 rounded-xl border-border bg-card/60 pl-10 pr-10 text-sm focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={busy || googleBusy}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-card text-accent accent-accent focus:ring-accent/30"
              />
              <span className="text-xs text-muted-foreground hover:text-foreground">
                Remember this browser
              </span>
            </label>
          </div>

          <Button
            type="submit"
            disabled={busy || googleBusy}
            className="group relative mt-2 h-11 w-full overflow-hidden rounded-xl bg-gradient-to-r from-accent via-indigo-600 to-accent text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 active:scale-[0.99] disabled:opacity-60"
          >
            <span className="flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in to Dashboard</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </span>
          </Button>
        </form>

        {/* Switch to Signup */}
        <div className="mt-6 rounded-xl border border-border/70 bg-card/40 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Don&apos;t have an account yet?{" "}
            <Link href="/signup" className="font-semibold text-accent hover:underline inline-flex items-center gap-1.5">
              <span>Create account</span>
              <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-2xs font-bold text-accent">
                +20 Free Credits
              </span>
            </Link>
          </p>
        </div>

        {/* Security Trust Badges */}
        <div className="mt-8 flex items-center justify-center gap-6 text-2xs text-muted-foreground/80">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            <span>256-bit SSL</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>Multi-Model AI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
            <span>No Card Required</span>
          </div>
        </div>
      </div>
    </div>
  );
}
