import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — MetaCSV',
  description: 'How MetaCSV collects, uses, and deletes your data.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: October 2026</p>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        This policy explains what MetaCSV stores, why, and how long we keep it. The short version:
        we store only what is needed to run your account, and the files you upload for processing
        are deleted automatically shortly after your results are ready.
      </p>

      <Section title="Information we collect">
        <p>When you create and use an account, we store:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Your account details — name and email address.</li>
          <li>Your credit balance and credit transaction history.</li>
          <li>
            Your generation history — the text results (titles, descriptions, keywords, prompts)
            produced for you, so you can revisit and re-export them.
          </li>
          <li>The Adobe Analytics searches you run, so your recent queries stay available to you.</li>
          <li>
            Any AI provider keys you choose to save in Settings. Keys are encrypted at rest and
            are never displayed in full after saving.
          </li>
        </ul>
      </Section>

      <Section title="Your uploads">
        <p>
          Files you upload are working copies used only to generate your results. They are{' '}
          <span className="font-medium text-foreground">
            deleted automatically within about 60 minutes
          </span>{' '}
          of upload — we do not keep a library of your images. What stays in your account is the
          generated text output, plus anything you deliberately save, such as your profile avatar
          or site branding. Those remain until you remove them or delete your account.
        </p>
      </Section>

      <Section title="Cookies and browser storage">
        <p>
          We use a session cookie to keep you signed in, and your browser stores your theme
          preference (light or dark) locally so the site looks the way you left it. We do not use
          advertising or cross-site tracking cookies.
        </p>
      </Section>

      <Section title="Third parties">
        <p>
          Generating metadata means sending the images you submit to the AI provider used for
          that run — your own connected provider account when you use your own API key, or our
          configured provider otherwise. Card payments are processed by Stripe; we never see or
          store your full card number. Market data shown in Adobe Analytics is fetched from
          public Adobe Stock pages through a data provider. We do not sell your personal data to
          anyone.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can review your account data, generation history, and credit log at any time from
          your dashboard. You can delete your account at any time in Settings; once deleted, your
          account data is purged within 30 days.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          If you have questions about this policy or about your data, contact the MetaCSV support
          team and mention &ldquo;Privacy&rdquo; in your message.
        </p>
      </Section>
    </div>
  );
}
