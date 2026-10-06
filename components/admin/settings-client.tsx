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
import { Server, Shield, Save, Loader2, Bot, Eye, EyeOff, CheckCircle2, XCircle, Key } from 'lucide-react';

type SiteSettings = {
  siteName?: string | null;
  tagline?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImageUrl?: string | null;
  twitterHandle?: string | null;
  gaMeasurementId?: string | null;
  gscVerification?: string | null;
  userApiKeyRequired?: boolean;
  apifyApiToken?: string | null;
  apifyActorId?: string | null;
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
    userApiKeyRequired: initialSettings?.userApiKeyRequired ?? false,
    apifyApiToken: initialSettings?.apifyApiToken ?? '',
    apifyActorId: initialSettings?.apifyActorId && initialSettings.apifyActorId !== 'KPyKQZuofuTIxI4yZ' ? initialSettings.apifyActorId : 'Ea82wcTpNYzTRV7A3',
  });
  const [showApifyToken, setShowApifyToken] = React.useState(false);
  const [testingApify, setTestingApify] = React.useState(false);
  const [apifyTestResult, setApifyTestResult] = React.useState<{
    ok: boolean;
    username?: string;
    actorName?: string;
    error?: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const handleTestApify = async () => {
    if (!settings.apifyApiToken?.trim()) {
      toast({
        title: 'Token required',
        description: 'Please enter an Apify API token before testing.',
        variant: 'error',
      });
      return;
    }
    setTestingApify(true);
    setApifyTestResult(null);
    try {
      const res = await fetch('/api/admin/apify/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: settings.apifyApiToken,
          actorId: settings.apifyActorId,
        }),
      });
      const data = await res.json();
      setApifyTestResult(data);
      if (data.ok) {
        toast({
          title: 'Apify Connected!',
          description: `Successfully connected as ${data.username}`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: data.error || 'Failed to authenticate with Apify',
          variant: 'error',
        });
      }
    } catch (err: any) {
      setApifyTestResult({ ok: false, error: err.message });
      toast({
        title: 'Connection Error',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setTestingApify(false);
    }
  };

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

      <Card className="border-2 border-accent/50 bg-gradient-to-b from-card to-accent/5 shadow-md">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl font-bold">Adobe Stock Scraper Engine (Apify)</CardTitle>
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                    Market Intelligence
                  </span>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  Configure Apify credentials to power live Adobe Stock scraping (Creator Portfolios, Published Dates &amp; Download Stats).
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="apifyApiToken" className="text-sm font-semibold">
                Apify API Token
              </Label>
              <a
                href="https://console.apify.com/account/integrations"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-accent underline hover:opacity-80"
              >
                Get Token &rarr;
              </a>
            </div>
            <div className="relative">
              <Input
                id="apifyApiToken"
                type={showApifyToken ? 'text' : 'password'}
                value={settings.apifyApiToken || ''}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, apifyApiToken: e.target.value }));
                  setApifyTestResult(null);
                }}
                placeholder="apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApifyToken(!showApifyToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showApifyToken ? 'Hide token' : 'Show token'}
              >
                {showApifyToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Personal Apify API token. Saved in database or via <code className="font-mono text-xs">APIFY_API_TOKEN</code> in <code className="font-mono text-xs">.env</code>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apifyActorId" className="text-sm font-semibold">
              Adobe Stock Actor ID / Name
            </Label>
            <Input
              id="apifyActorId"
              value={settings.apifyActorId || 'Ea82wcTpNYzTRV7A3'}
              onChange={(e) => {
                setSettings((s) => ({ ...s, apifyActorId: e.target.value }));
                setApifyTestResult(null);
              }}
              placeholder="Ea82wcTpNYzTRV7A3"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Actor ID for <em>Adobe Stock Scraper</em> (Default: <code className="font-mono text-xs">Ea82wcTpNYzTRV7A3</code>).
            </p>
          </div>

          {apifyTestResult && (
            <div
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                apifyTestResult.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              }`}
            >
              {apifyTestResult.ok ? (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    Successfully verified Apify connection for account:{' '}
                    <strong>{apifyTestResult.username}</strong> (Actor:{' '}
                    {apifyTestResult.actorName})
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>Connection failed: {apifyTestResult.error}</span>
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Scraper Settings
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleTestApify}
              disabled={testingApify || !settings.apifyApiToken}
              className="gap-2"
            >
              {testingApify ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Key className="h-4 w-4 text-accent" />
              )}
              Test Apify Connection
            </Button>
          </div>
        </CardContent>
      </Card>

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
            label="Enforce User AI API Keys (BYOK)"
            description="When enabled, users must supply their own AI API keys (Gemini, Grok, or OpenAI) to generate metadata. System keys will not be used for user requests."
            checked={Boolean(settings.userApiKeyRequired)}
            onChange={(checked) => {
              setSettings((s) => ({ ...s, userApiKeyRequired: checked }));
              saveMutation.mutate({ ...settings, userApiKeyRequired: checked });
            }}
          />
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
