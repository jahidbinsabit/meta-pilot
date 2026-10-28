import { prisma } from '@/lib/db';
import { SettingsClient } from '@/components/admin/settings-client';
import { ensureDatabaseSchema } from '@/lib/db-sync';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await ensureDatabaseSchema().catch(() => {});

  let users = 0;
  let paid = 0;
  let settings = null;

  try {
    const [u, p, s] = await Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.payment.count({ where: { status: 'COMPLETED' } }).catch(() => 0), // M-B6: Order is write-dead
      prisma.siteSettings.findUnique({ where: { id: 'default' } }).catch(() => null),
    ]);
    users = u;
    paid = p;
    settings = s;
  } catch (err) {
    console.error('[AdminSettingsPage] Error fetching settings:', err);
  }

  // M4 (same masking as GET /api/admin/site-settings): the raw Apify token
  // must never be serialised into the RSC payload. The client receives only
  // the `••••last4` preview + `apifyTokenSet`; on save the PATCH handler
  // treats a masked token as "unchanged", so the stored token survives.
  const publicInitialSettings = settings
    ? {
        ...settings,
        apifyApiToken: settings.apifyApiToken
          ? settings.apifyApiToken.length <= 4
            ? '••••'
            : `••••${settings.apifyApiToken.slice(-4)}`
          : settings.apifyApiToken,
        apifyTokenSet: Boolean(settings.apifyApiToken),
      }
    : settings;

  return <SettingsClient users={users} paidOrders={paid} initialSettings={publicInitialSettings} />;
}

