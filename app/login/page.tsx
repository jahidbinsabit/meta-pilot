import * as React from "react";
import Link from "next/link";
import { LoginHeader } from "@/components/auth/login-header";
import { LoginForm } from "@/components/auth/login-form";
import { LoginShowcase } from "@/components/auth/login-showcase";

export const metadata = {
  title: "Sign In — StockForge AI",
  description: "Sign in to access your AI stock metadata tools, analytics, and batch workflow.",
};

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full bg-background text-foreground flex flex-col justify-between overflow-x-hidden selection:bg-accent/30">
      {/* Background ambient light effects */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-accent/15 blur-[120px] opacity-70" />
        <div className="absolute top-[40%] -left-[10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[140px] opacity-50" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[160px] opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      {/* Dual Panel Grid */}
      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-12">
        {/* Left Side: Form Container */}
        <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:col-span-6 xl:col-span-5 lg:px-14 xl:px-16">
          <LoginHeader />
          <LoginForm />
          <div className="pt-4 text-2xs text-muted-foreground/60 flex items-center justify-between border-t border-border/40">
            <span>© {new Date().getFullYear()} StockForge AI.</span>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-muted-foreground hover:underline">Privacy</Link>
              <Link href="/terms" className="hover:text-muted-foreground hover:underline">Terms</Link>
            </div>
          </div>
        </div>

        {/* Right Side: Visual Showcase Hero */}
        <LoginShowcase />
      </div>
    </div>
  );
}
