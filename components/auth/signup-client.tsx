"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Loader2,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { GoogleColorIcon } from "@/components/auth/google-icon";
import { LoginHeader } from "@/components/auth/login-header";
import { LoginShowcase } from "@/components/auth/login-showcase";

type Step = "register" | "verify";

export function SignupClient() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState<Step>("register");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [name, setName] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [googleBusy, setGoogleBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || googleBusy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ title: "Sign up failed", description: j.error || "Please try again.", variant: "error" });
        return;
      }
      toast({
        title: "Account created!",
        description: "We sent a 6-digit verification code to your email.",
        variant: "success",
      });
      setStep("verify");
    } catch {
      toast({ title: "Sign up failed", description: "An unexpected error occurred.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (busy || googleBusy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({
          title: "Verification failed",
          description: j.error || "Invalid verification code",
          variant: "error",
        });
        return;
      }
      toast({ title: 'Email verified successfully!', description: 'Signing in...', variant: 'success' });
      
      const loginRes = await signIn("credentials", { email, password, redirect: false });
      if (loginRes?.ok) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    } catch {
      toast({ title: "Verification failed", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (busy || !email) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/verify-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) toast({ title: "Verification code resent", description: "Please check your inbox.", variant: "success" });
      else toast({ title: "Could not resend code", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    if (busy || googleBusy) return;
    setGoogleBusy(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      toast({ title: "Sign up with Google failed", variant: "error" });
      setGoogleBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-background text-foreground flex flex-col justify-between overflow-x-hidden selection:bg-accent/30">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-accent/15 blur-[120px] opacity-70" />
        <div className="absolute top-[40%] -left-[10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[140px] opacity-50" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[160px] opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-12">
        <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:col-span-6 xl:col-span-5 lg:px-14 xl:px-16">
          <LoginHeader />

          <div className="my-auto py-8">
            <div className="max-w-md">
              {step === "register" ? (
                <>
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-2xs font-semibold text-accent">
                      <Sparkles className="h-3 w-3" />
                      <span>Claim 20 Free Credits</span>
                    </div>
                    <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                      Create an account
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Start automating your stock metadata workflow with multi-model AI.
                    </p>
                  </div>

                  <div className="mt-7 space-y-4">
                    <button
                      type="button"
                      onClick={onGoogleSignIn}
                      disabled={busy || googleBusy}
                      className="relative flex w-full items-center justify-center gap-3.5 rounded-xl border border-border bg-card/80 px-4 py-3 text-sm font-medium text-foreground shadow-sm hover:border-accent/40 hover:bg-card active:scale-[0.99] disabled:opacity-50 transition-all"
                    >
                      {googleBusy ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : <GoogleColorIcon className="h-5 w-5" />}
                      <span>Sign up with Google</span>
                    </button>
                    <div className="relative flex items-center justify-center">
                      <div className="w-full border-t border-border/80" />
                      <span className="absolute bg-background px-3 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                        Or continue with email
                      </span>
                    </div>
                  </div>

                  <form onSubmit={onSubmit} className="mt-5 space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/90">Full Name</label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
                          <User className="h-4 w-4" />
                        </div>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your name"
                          required
                          disabled={busy || googleBusy}
                          className="h-11 rounded-xl border-border bg-card/60 pl-10 text-sm focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/90">Email address</label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                        </div>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          required
                          disabled={busy || googleBusy}
                          className="h-11 rounded-xl border-border bg-card/60 pl-10 text-sm focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/90">Password (min 8 chars)</label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground">
                          <Lock className="h-4 w-4" />
                        </div>
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          minLength={8}
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

                    <Button
                      type="submit"
                      disabled={busy || googleBusy}
                      className="group relative mt-2 h-11 w-full overflow-hidden rounded-xl bg-gradient-to-r from-accent via-indigo-600 to-accent text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 active:scale-[0.99] disabled:opacity-60"
                    >
                      <span className="flex items-center justify-center gap-2">
                        {busy ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Creating account…</span>
                          </>
                        ) : (
                          <>
                            <span>Get Started with 20 Free Credits</span>
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </>
                        )}
                      </span>
                    </Button>
                  </form>
                </>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                      <KeyRound className="h-6 w-6" />
                    </div>
                    <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                      Verify your email
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      We sent a verification code to{" "}
                      <span className="font-semibold text-foreground">{email}</span>. Please enter it below.
                    </p>
                  </div>

                  <form onSubmit={onVerify} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/90">Verification Code</label>
                      <Input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.toUpperCase())}
                        placeholder="123456"
                        maxLength={8}
                        className="h-12 font-mono text-center text-lg tracking-[0.3em] font-bold rounded-xl border-border bg-card/60 focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
                        required
                        disabled={busy}
                        autoFocus
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={busy}
                      className="h-11 w-full rounded-xl bg-gradient-to-r from-accent via-indigo-600 to-accent text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 active:scale-[0.99] disabled:opacity-60"
                    >
                      {busy ? "Verifying…" : "Verify Email & Continue"}
                    </Button>

                    <div className="flex items-center justify-between text-xs pt-2">
                      <button
                        type="button"
                        onClick={onResend}
                        disabled={busy}
                        className="text-accent hover:underline disabled:opacity-50 font-medium"
                      >
                        Resend code
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("register");
                          setOtp("");
                        }}
                        disabled={busy}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        ← Change email
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="mt-6 rounded-xl border border-border/70 bg-card/40 p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/login" className="font-semibold text-accent hover:underline">
                    Sign in here
                  </Link>
                </p>
              </div>

              <div className="mt-8 flex items-center justify-center gap-6 text-2xs text-muted-foreground/80">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                  <span>256-bit SSL</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <span>Free 20 Credits</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  <span>No Card Required</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 text-2xs text-muted-foreground/60 flex items-center justify-between border-t border-border/40">
            <span>© {new Date().getFullYear()} StockForge AI.</span>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-muted-foreground hover:underline">Privacy</Link>
              <Link href="/terms" className="hover:text-muted-foreground hover:underline">Terms</Link>
            </div>
          </div>
        </div>

        <LoginShowcase />
      </div>
    </div>
  );
}
