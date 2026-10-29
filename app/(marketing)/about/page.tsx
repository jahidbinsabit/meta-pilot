import type { Metadata } from 'next';
import Link from 'next/link';
import { Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About — MetaCSV',
  description:
    'MetaCSV is the batch AI metadata and Adobe Stock analytics workspace for stock-content creators and contributors.',
};

const STEPS = [
  {
    number: '01',
    title: 'Upload your assets',
    description:
      'Drag in images, vectors, and EPS/AI files — up to 100 at a time. Uploads are temporary working copies, deleted automatically once processed.',
  },
  {
    number: '02',
    title: 'AI generates the metadata',
    description:
      'Each file gets a title, description, and ranked keyword set tuned to the platform you are listing on — Adobe Stock, Shutterstock, Freepik, Vecteezy, and more.',
  },
  {
    number: '03',
    title: 'Review and refine',
    description:
      'Edit results inline, regenerate the ones you do not like, and check your Adobe Stock analytics to see which subjects and contributors are moving.',
  },
  {
    number: '04',
    title: 'Export and list',
    description:
      'Download a platform-ready CSV in the exact format each marketplace expects, and list your batch in minutes instead of hours.',
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-accent" />
        <span className="font-display text-xl font-semibold">MetaCSV</span>
      </div>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">About</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        MetaCSV is a workspace for stock-content creators and contributors. Listing content on
        stock marketplaces means writing a title, a description, and dozens of keywords for every
        single file — work that takes minutes per asset and decides whether the asset is ever
        found. MetaCSV automates that work with AI, and pairs it with Adobe Stock market
        analytics so the metadata you ship is informed by what buyers actually download.
      </p>

      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">Who it is for</h2>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        Photographers, illustrators, vector artists, and small studios who sell on Adobe Stock,
        Shutterstock, Freepik, Vecteezy, and similar marketplaces — especially contributors
        working in batches, where manual metadata turns a one-hour upload session into a day of
        typing.
      </p>

      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">What it does</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Batch AI metadata</span> — titles,
          descriptions, and ranked keywords for up to 100 images in one run, exported as
          platform-ready CSVs.
        </li>
        <li>
          <span className="font-medium text-foreground">Image to Prompt</span> — turn any image
          into a detailed text prompt you can reuse in your own generation workflow.
        </li>
        <li>
          <span className="font-medium text-foreground">Adobe Stock analytics</span> — explore
          contributor portfolios and keyword performance with sortable, filterable market data.
        </li>
        <li>
          <span className="font-medium text-foreground">Contributor tools</span> — a suite of
          small utilities for everyday stock work: keyword clustering, title A/B checks, color
          palette extraction, EPS/AI conversion, and more.
        </li>
      </ul>

      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">How it works</h2>
      <div className="mt-4 space-y-4">
        {STEPS.map((step) => (
          <div key={step.number} className="flex gap-4 rounded-xl border border-border bg-card/50 p-5">
            <span className="font-display text-lg font-bold text-accent">{step.number}</span>
            <div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-border bg-card/50 p-6 text-center">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Ready to list your next batch?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a free account and generate your first metadata today.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90"
        >
          Get started free
        </Link>
      </div>
    </div>
  );
}
