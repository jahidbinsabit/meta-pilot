import { SignupClient } from '@/components/auth/signup-client';
import { getSiteSettings } from '@/lib/site-settings';

export async function generateMetadata() {
  const settings = await getSiteSettings().catch(() => null);
  const siteName = settings?.siteName || 'StockForge AI';
  return {
    title: `Sign Up — ${siteName}`,
    description: `Create your ${siteName} account and start automating your stock metadata workflow.`,
  };
}

export default async function SignupPage() {
  const settings = await getSiteSettings().catch(() => null);
  const siteName = settings?.siteName || 'StockForge AI';
  const signupCredits =
    typeof settings?.signupCredits === 'number' ? settings.signupCredits : 20;
  return <SignupClient siteName={siteName} signupCredits={signupCredits} />;
}
