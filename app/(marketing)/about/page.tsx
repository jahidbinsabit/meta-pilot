import { Zap } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-accent" />
        <span className="font-display text-xl font-semibold">StockForge AI</span>
      </div>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">About</h1>
      <p className="mt-4 text-muted-foreground">
        StockForge AI is a SaaS platform for stock-content creators. We combine generative AI with
        market analytics so you can list faster, rank better, and understand what sells.
      </p>
    </div>
  );
}
