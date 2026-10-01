'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AdobeAnalyticsLimits } from '@/components/admin/adobe-analytics-limits';
import { Server, Shield, Bell, Globe, Save, Loader2 } from 'lucide-react';

type SiteSettings = {
  siteName?: string | null;
  tagline?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImageUrl?: string | null;
  twitterHandle?: string | null;
  gaMeasurementId?: string | null;
  gscVerification?: string | null;
};

export function SettingsClient({
  users,
  paidOrders,
  initialSettings,
}: {
  users: number;
  paidOrders: number;
  initialSettings?: SiteSettings | null;
}) {
  const [settings, setSettings] = React.useState<SiteSettings>({
    siteName: initialSettings?.siteName ?? 'StockForge AI',
    tagline: initialSettings?.tagline ?? '',
    metaTitle: initialSettings?.metaTitle ?? '',
    metaDescription: initialSettings?.metaDescription ?? '',
    ogImageUrl: initialSettings?.ogImageUrl ?? '',
    twitterHandle: initialSettings?.twitterHandle ?? '',
    gaMeasurementId: initialSettings?.gaMeasurementId ?? '',
    gscVerification: initialSettings?.gscVerification ?? '',
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SiteSettings>) => {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'save_failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      router.refresh();
      toast({ title: 'Settings saved', variant: 'success' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to save settings', description: err.message, variant: 'error' });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(settings);
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Settings
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Platform Settings</h1>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <Server className="h-5 w-5 text-muted-foreground" />
            <p className="mt-2 font-mono text-2xl font-semibold">{users}</p>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <p className="mt-2 font-mono text-2xl font-semibold">{paidOrders}</p>
            <p className="text-xs text-muted-foreground">Paid orders</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Site settings</CardTitle>
          <CardDescription>Marketing site identity and search metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="siteName">Site name</Label>
              <Input
                id="siteName"
                value={settings.siteName || ''}
                onChange={(e) => setSettings((s) => ({ ...s, siteName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={settings.tagline || ''}
                onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="metaTitle">Meta title</Label>
            <Input
              id="metaTitle"
              value={settings.metaTitle || ''}
              onChange={(e) => setSettings((s) => ({ ...s, metaTitle: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metaDescription">Meta description</Label>
            <Input
              id="metaDescription"
              value={settings.metaDescription || ''}
              onChange={(e) => setSettings((s) => ({ ...s, metaDescription: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ogImageUrl">OG image URL</Label>
            <Input
              id="ogImageUrl"
              type="url"
              value={settings.ogImageUrl || ''}
              onChange={(e) => setSettings((s) => ({ ...s, ogImageUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analytics &amp; Search Console</CardTitle>
          <CardDescription>
            These values are injected into the public site after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gaMeasurementId">Google Analytics Measurement ID (G-XXXXXX)</Label>
            <Input
              id="gaMeasurementId"
              value={settings.gaMeasurementId || ''}
              onChange={(e) => setSettings((s) => ({ ...s, gaMeasurementId: e.target.value }))}
              placeholder="G-XXXXXXXXXX"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gscVerification">Google Search Console Verification Code</Label>
            <Input
              id="gscVerification"
              value={settings.gscVerification || ''}
              onChange={(e) => setSettings((s) => ({ ...s, gscVerification: e.target.value }))}
              placeholder="Verification meta content value"
            />
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save site settings
          </Button>
          {saveMutation.isError && (
            <p className="text-sm text-destructive">
              Unable to save site settings. Please try again.
            </p>
          )}
          {saveMutation.isSuccess && <p className="text-sm text-accent">Site settings saved.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature toggles</CardTitle>
          <CardDescription>Admin-controlled platform flags.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="Public signups"
            description="Allow new users to create accounts."
            checked={true}
          />
          <Toggle
            label="Email notifications"
            description="Send transactional email on signups and payments."
            checked={false}
          />
          <Toggle
            label="Daily free credits"
            description="Grant free-tier credits at UTC midnight."
            checked={true}
          />
        </CardContent>
      </Card>

      <AdobeAnalyticsLimits />
    </div>
  );
}
