import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — MetaCSV',
  description: 'The terms that govern your use of MetaCSV.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: October 2026</p>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        By creating an account or using MetaCSV, you agree to these terms. If you do not agree,
        please do not use the service.
      </p>

      <Section title="The service">
        <p>
          MetaCSV provides AI-assisted tools for stock-content creators: batch metadata
          generation, image-to-prompt conversion, Adobe Stock analytics, and related contributor
          utilities. Features may change over time as the product evolves; we will reflect
          material changes in these terms.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          You are responsible for the activity on your account and for keeping your sign-in
          credentials secure. Provide accurate account information, and let us know if you
          believe your account has been compromised. One account per person; do not share or
          resell account access.
        </p>
      </Section>

      <Section title="Credits">
        <p>
          Credits are a virtual balance used to pay for generations and tool runs inside
          MetaCSV. Credits have no cash value, are non-transferable between accounts, and cannot
          be exchanged for money. Credits in your wallet do not expire while your account is
          active.
        </p>
      </Section>

      <Section title="Plans">
        <p>
          Paid plans are sold as a{' '}
          <span className="font-medium text-foreground">
            one-time payment for 30 days of plan benefits
          </span>{' '}
          from the date of purchase. Plans do not auto-renew and no recurring charge is made.
          Buying a new plan replaces your current plan immediately; the credits included with
          each purchase are added to your wallet. Credit packages are likewise one-time
          purchases.
        </p>
      </Section>

      <Section title="Refunds">
        <p>
          If a payment you made is refunded or charged back through your payment provider, the
          corresponding credits and plan access granted by that payment will be revoked. If you
          believe a charge was made in error, contact us before disputing it so we can review
          the transaction with you.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          You retain full ownership of the content you upload and of the metadata generated from
          it; AI-generated metadata is yours to use, including for commercial stock listings. You
          are responsible for having the rights to upload and process the content you submit.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Do not use MetaCSV to infringe anyone&apos;s intellectual-property or other rights, to
          upload unlawful content, to attempt to disrupt or reverse-engineer the service, or to
          bypass usage limits or payment. We may suspend accounts that do.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          The service is provided &ldquo;as is&rdquo;, without warranties of any kind. AI-generated
          output can contain errors — review metadata before submitting it to a marketplace. To
          the extent permitted by law, our liability for any claim arising from the service is
          limited to the amount you paid us in the 30 days before the claim.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms from time to time. The current version always lives on this
          page, and continued use of the service after a change means you accept the updated
          terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms? Contact the MetaCSV support team and mention
          &ldquo;Terms&rdquo; in your message.
        </p>
      </Section>
    </div>
  );
}
