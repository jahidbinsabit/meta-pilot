import { SettingsClient } from '@/components/dashboard/settings-client';
import { getSiteSettings } from '@/lib/site-settings';

export default async function SettingsPage() {
  const settings = await getSiteSettings().catch(() => null);
  const siteName = settings?.siteName || 'StockForge AI';
  return <SettingsClient siteName={siteName} />;
}
