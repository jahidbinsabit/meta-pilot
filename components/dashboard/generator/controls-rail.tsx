'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { PLATFORMS, type TargetPlatform, type GeneratorSettings } from '@/lib/generator/types';
import { Sliders, Key, Layers, FileText, ChevronDown, ChevronUp, Check, Sparkles, Info, Lock, Image as ImageIcon } from 'lucide-react';
import { UserApiKeysModal } from '@/components/dashboard/user-api-keys-dialog';


interface ControlsRailProps {
  activeTab: 'metadata' | 'prompt';
  onTabChange: (tab: 'metadata' | 'prompt') => void;
  selectedPlatform?: TargetPlatform;
  handlePlatformChange?: (platform: TargetPlatform) => void;
  settings?: GeneratorSettings;
  setSettings?: React.Dispatch<React.SetStateAction<GeneratorSettings>>;
  persistSettings?: (partial: Partial<GeneratorSettings>) => void;
  currentPlatformConfig?: typeof PLATFORMS[TargetPlatform];
  includeDescription?: boolean;
  setIncludeDescription?: (v: boolean) => void;
  prefixEnabled?: boolean;
  setPrefixEnabled?: (v: boolean) => void;
  prefixText?: string;
  setPrefixText?: (v: string) => void;
  suffixEnabled?: boolean;
  setSuffixEnabled?: (v: boolean) => void;
  suffixText?: string;
  setSuffixText?: (v: string) => void;
  negWordsEnabled?: boolean;
  setNegWordsEnabled?: (v: boolean) => void;
  negWords?: string[];
  negKwsEnabled?: boolean;
  setNegKwsEnabled?: (v: boolean) => void;
  negKws?: string[];
  addTag?: (type: 'negWords' | 'negKws', val: string) => void;
  removeTag?: (type: 'negWords' | 'negKws', idx: number) => void;
  batchGeneration?: boolean;
  setBatchGeneration?: (v: boolean) => void;
  user?: { id: string; email: string; name: string | null; preferredAiProvider?: string };

  // Prompt-specific props
  style?: string;
  onStyleChange?: (v: string) => void;
  styles?: Array<{ slug: string; label: string }>;
  costPerImage?: number;
}

function PlatformIcon({ platform }: { platform: TargetPlatform }) {
  switch (platform) {
    case 'adobe':
      return <span className='flex h-4 w-4 items-center justify-center rounded bg-red-500/15 text-[9px] font-bold text-red-500'>Ad</span>;
    case 'shutterstock':
      return <span className='flex h-4 w-4 items-center justify-center rounded bg-blue-500/15 text-[9px] font-bold text-blue-500'>Sh</span>;
    case 'freepik':
      return <span className='flex h-4 w-4 items-center justify-center rounded bg-emerald-500/15 text-[9px] font-bold text-emerald-500'>Fr</span>;
    case 'vecteezy':
      return <span className='flex h-4 w-4 items-center justify-center rounded bg-amber-500/15 text-[9px] font-bold text-amber-500'>Ve</span>;
    case 'istock':
      return <span className='flex h-4 w-4 items-center justify-center rounded bg-sky-500/15 text-[9px] font-bold text-sky-500'>iS</span>;
    default:
      return <span className='flex h-4 w-4 items-center justify-center rounded bg-purple-500/15 text-[9px] font-bold text-purple-500'>Un</span>;
  }
}

export function ControlsRail({
  activeTab,
  onTabChange,
  selectedPlatform = 'adobe',
  handlePlatformChange = () => {},
  settings = { titleLength: 70, titleMin: 20, titleMax: 200, descriptionLength: 150, keywordsCount: 35, keywordsMin: 10, keywordsMax: 50, prefix: '', suffix: '', negativeTitleWords: [], negativeKeywords: [], defaultPrefix: '', defaultSuffix: '' },
  setSettings = () => {},
  persistSettings = () => {},
  currentPlatformConfig = PLATFORMS.adobe,
  includeDescription = true,
  setIncludeDescription = () => {},
  prefixEnabled = false,
  setPrefixEnabled = () => {},
  prefixText = '',
  setPrefixText = () => {},
  suffixEnabled = false,
  setSuffixEnabled = () => {},
  suffixText = '',
  setSuffixText = () => {},
  negWordsEnabled = false,
  setNegWordsEnabled = () => {},
  negWords = [],
  negKwsEnabled = false,
  setNegKwsEnabled = () => {},
  negKws = [],
  addTag = () => {},
  removeTag = () => {},
  batchGeneration = true,
  setBatchGeneration = () => {},
  user,
  style,
  onStyleChange,
  styles,
  costPerImage,
}: ControlsRailProps) {
  const [metadataSettingsOpen, setMetadataSettingsOpen] = React.useState(true);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [apiKeysOpen, setApiKeysOpen] = React.useState(false);

  const providerName = user?.preferredAiProvider && user.preferredAiProvider !== 'auto' 
    ? user.preferredAiProvider.charAt(0).toUpperCase() + user.preferredAiProvider.slice(1)
    : 'Google Gemini';

  return (
    <div className='w-full lg:w-[320px] shrink-0 space-y-4 lg:sticky lg:top-6 lg:self-start max-h-[calc(100vh-3rem)] overflow-y-auto pr-1'>
      {/* CARD A - Controls */}
      <Card className='rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3.5'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground'>
              <Sliders className='h-4 w-4' />
            </div>
            <div>
              <h2 className='text-sm font-semibold text-foreground'>Controls</h2>
              <p className='text-[11px] text-muted-foreground'>{providerName}</p>
            </div>
          </div>
          <Button
            variant='outline'
            size='xs'
            onClick={() => setApiKeysOpen(true)}
            className='h-8 gap-1.5 rounded-xl border-border bg-background text-xs font-medium text-foreground hover:bg-muted'
          >
            <Key className='h-3.5 w-3.5 text-accent' />
            API Keys
          </Button>
        </div>

        {/* Segmented Control for Metadata / Prompt */}
        <div className='flex rounded-xl bg-muted/60 p-1'>
          <button
            type='button'
            onClick={() => onTabChange('metadata')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all',
              activeTab === 'metadata'
                ? 'bg-foreground text-background shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Layers className='h-3.5 w-3.5' />
            Metadata
          </button>
          <button
            type='button'
            onClick={() => onTabChange('prompt')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all',
              activeTab === 'prompt'
                ? 'bg-foreground text-background shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ImageIcon className='h-3.5 w-3.5' />
            Prompt
          </button>
        </div>
      </Card>

      {/* CARD B - Batch Generation */}
      <Card className='rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center justify-between'>
        <div className='flex items-center gap-2.5'>
          <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400'>
            <Layers className='h-4 w-4' />
          </div>
          <div>
            <h3 className='text-sm font-semibold text-foreground'>Batch Generation</h3>
            <p className='text-[11px] text-muted-foreground'>Process multiple at once</p>
          </div>
        </div>
        <Toggle
          checked={batchGeneration}
          onCheckedChange={setBatchGeneration}
        />
      </Card>

      {/* CARD C - Prompt Settings (if prompt tab) */}
      {activeTab === 'prompt' && (
        <Card className='rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-semibold text-foreground'>Prompt Settings</h3>
          </div>
          <div className='space-y-3'>
            <div>
              <label className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                Prompt Style
              </label>
              <select
                value={style || ''}
                onChange={(e) => onStyleChange?.(e.target.value)}
                disabled={!styles?.length}
                aria-label="Prompt Style"
                className='mt-1.5 block w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
              >
                {!styles?.length && <option value=''>Loading presets…</option>}
                {styles?.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className='mt-1.5 text-[11px] text-muted-foreground leading-relaxed'>
                The admin defines which styles are available and what each one asks the model for.
              </p>
            </div>

            <div className='rounded-xl border border-border bg-card-2/50 p-3 space-y-1'>
              <div className='flex items-center justify-between text-xs'>
                <span className='text-muted-foreground'>Cost per image</span>
                <span className='font-semibold text-foreground'>{costPerImage ?? 1} credit{costPerImage === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* CARD C - Metadata Settings (if metadata tab) */}
      {activeTab === 'metadata' && (
        <>
          <Card className='rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4'>
            <div
              role='button'
              tabIndex={0}
              onClick={() => setMetadataSettingsOpen(!metadataSettingsOpen)}
              onKeyDown={(e) => e.key === 'Enter' && setMetadataSettingsOpen(!metadataSettingsOpen)}
              className='flex cursor-pointer items-center justify-between select-none'
            >
              <div className='flex items-center gap-2'>
                <h3 className='text-sm font-semibold text-foreground'>Metadata Settings</h3>
              </div>
              <button type='button' className='text-muted-foreground hover:text-foreground'>
                {metadataSettingsOpen ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
              </button>
            </div>

            {metadataSettingsOpen && (
              <div className='space-y-4 pt-1'>
                {/* 1. EXPORT PLATFORM */}
                <div className='space-y-2'>
                  <label className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                    Export Platform
                  </label>
                  <div className='grid grid-cols-3 gap-1'>
                    {(Object.keys(PLATFORMS) as TargetPlatform[]).map((platKey) => {
                      const p = PLATFORMS[platKey];
                      const isActive = selectedPlatform === platKey;
                      return (
                        <button
                          key={platKey}
                          type='button'
                          onClick={() => handlePlatformChange(platKey)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
                            isActive
                              ? 'border-foreground bg-foreground text-background font-semibold shadow-sm'
                              : 'border-border bg-background/50 text-muted-foreground hover:border-accent/40 hover:text-foreground',
                          )}
                        >
                          <PlatformIcon platform={platKey} />
                          <span className='flex-1 truncate text-[11px]'>{p.shortLabel}</span>
                          {isActive && <span className='h-1 w-1 rounded-full bg-accent' />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className='h-px bg-border my-2' />

                {/* 2. TITLE LENGTH */}
                <div className='space-y-1.5'>
                  <div className='flex items-center justify-between'>
                    <label className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                      Title Length
                    </label>
                    <span className='font-mono text-xs font-semibold text-foreground'>
                      {settings.titleLength} chars (~{Math.round(settings.titleLength / 6)} words)
                    </span>
                  </div>
                  <input
                    type='range'
                    min={currentPlatformConfig.limits.titleMin}
                    max={currentPlatformConfig.limits.titleMax}
                    step={1}
                    value={settings.titleLength}
                    onChange={(e) => {
                      const titleLength = parseInt(e.target.value, 10);
                      setSettings((s) => ({ ...s, titleLength }));
                      persistSettings({ titleLength });
                    }}
                    className='w-full accent-foreground cursor-pointer'
                  />
                  <div className='flex justify-between text-[10px] text-muted-foreground'>
                    <span>Min: {currentPlatformConfig.limits.titleMin}</span>
                    <span className='text-accent font-medium'>Rec: ~{currentPlatformConfig.limits.recommendedTitleLength}</span>
                    <span>Max: {currentPlatformConfig.limits.titleMax}</span>
                  </div>
                </div>

                {/* 3. DESCRIPTION */}
                <div className='space-y-1.5'>
                  <label className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                    Description
                  </label>
                  <div className='flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground'>
                    <div className='flex items-center gap-2'>
                      <FileText className='h-3.5 w-3.5 text-muted-foreground' />
                      <span>150 chars (~25 words) (fixed)</span>
                    </div>
                    <Lock className='h-3 w-3 text-muted-foreground/60' />
                  </div>
                </div>

                {/* 4. KEYWORDS COUNT */}
                <div className='space-y-1.5'>
                  <div className='flex items-center justify-between'>
                    <label className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                      Keywords Count
                    </label>
                    <span className='font-mono text-xs font-semibold text-foreground'>
                      {settings.keywordsCount} keywords
                    </span>
                  </div>
                  <input
                    type='range'
                    min={currentPlatformConfig.limits.keywordsMin}
                    max={currentPlatformConfig.limits.keywordsMax}
                    step={1}
                    value={settings.keywordsCount}
                    onChange={(e) => {
                      const keywordsCount = parseInt(e.target.value, 10);
                      setSettings((s) => ({ ...s, keywordsCount }));
                      persistSettings({ keywordsCount });
                    }}
                    className='w-full accent-foreground cursor-pointer'
                  />
                  <div className='flex justify-between text-[10px] text-muted-foreground'>
                    <span>Min: {currentPlatformConfig.limits.keywordsMin}</span>
                    <span className='text-accent font-medium'>Rec: {currentPlatformConfig.limits.recommendedKeywordsCount}</span>
                    <span>Max: {currentPlatformConfig.limits.keywordsMax}</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* CARD D - Options */}
          <Card className='rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4'>
            <div>
              <h3 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>Options</h3>
            </div>

            <div className='space-y-3.5'>
              {/* Include Description Toggle */}
              <div className='flex items-center justify-between'>
                <div>
                  <span className='text-xs font-medium text-foreground'>Include Description</span>
                  <p className='text-[11px] text-muted-foreground'>Generate SEO caption</p>
                </div>
                <Toggle
                  checked={includeDescription}
                  onCheckedChange={(v) => {
                    setIncludeDescription(v);
                    persistSettings({ includeDescription: v });
                  }}
                />
              </div>

              <div className='h-px bg-border my-1' />

              {/* Prefix Input */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-medium text-foreground'>Prefix</span>
                  <p className='text-[11px] text-muted-foreground'>Prepend text to titles</p>
                </div>
                <Toggle
                  checked={prefixEnabled}
                  onCheckedChange={(v) => {
                    setPrefixEnabled(v);
                    persistSettings({ prefix: v ? prefixText : '' });
                  }}
                />
              </div>
              {prefixEnabled && (
                <Input
                  value={prefixText}
                  onChange={(e) => {
                    setPrefixText(e.target.value);
                    persistSettings({ prefix: e.target.value });
                  }}
                  placeholder='Prepended to every title'
                  className='h-8 text-xs'
                />
              )}

              {/* Suffix Input */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-medium text-foreground'>Suffix</span>
                  <p className='text-[11px] text-muted-foreground'>Append text to titles</p>
                </div>
                <Toggle
                  checked={suffixEnabled}
                  onCheckedChange={(v) => {
                    setSuffixEnabled(v);
                    persistSettings({ suffix: v ? suffixText : '' });
                  }}
                />
              </div>
              {suffixEnabled && (
                <Input
                  value={suffixText}
                  onChange={(e) => {
                    setSuffixText(e.target.value);
                    persistSettings({ suffix: e.target.value });
                  }}
                  placeholder='Appended to every title'
                  className='h-8 text-xs'
                />
              )}

              <div className='h-px bg-border my-2' />

              {/* Advanced collapsible subsection */}
              <div className='space-y-3'>
                <div
                  role='button'
                  tabIndex={0}
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  onKeyDown={(e) => e.key === 'Enter' && setAdvancedOpen(!advancedOpen)}
                  className='flex cursor-pointer items-center justify-between text-xs font-semibold text-foreground select-none'
                >
                  <span>Advanced Settings</span>
                  {advancedOpen ? <ChevronUp className='h-3.5 w-3.5 text-muted-foreground' /> : <ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />}
                </div>

                {advancedOpen && (
                  <div className='space-y-3 pt-1'>
                    <div>
                      <div className='flex items-center justify-between'>
                        <span className='text-xs font-medium text-foreground'>Negative Title Words</span>
                        <Toggle
                          checked={negWordsEnabled}
                          onCheckedChange={setNegWordsEnabled}
                        />
                      </div>
                      {negWordsEnabled && (
                        <div className='mt-2'>
                          <TagInputList
                            values={negWords}
                            onAdd={(v) => addTag('negWords', v)}
                            onRemove={(i) => removeTag('negWords', i)}
                            placeholder='Word to avoid'
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <div className='flex items-center justify-between'>
                        <span className='text-xs font-medium text-foreground'>Negative Keywords</span>
                        <Toggle
                          checked={negKwsEnabled}
                          onCheckedChange={setNegKwsEnabled}
                        />
                      </div>
                      {negKwsEnabled && (
                        <div className='mt-2'>
                          <TagInputList
                            values={negKws}
                            onAdd={(v) => addTag('negKws', v)}
                            onRemove={(i) => removeTag('negKws', i)}
                            placeholder='Keyword to avoid'
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      {/* API Keys Modal */}
      <UserApiKeysModal open={apiKeysOpen} onOpenChange={setApiKeysOpen} />
    </div>
  );
}

function TagInputList({
  values,
  onAdd,
  onRemove,
  placeholder,
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = React.useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft('');
  }

  return (
    <div className='space-y-2'>
      {values.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground'
            >
              {v}
              <button
                type='button'
                onClick={() => onRemove(i)}
                aria-label={`Remove ${v}`}
                className='text-muted-foreground hover:text-foreground'
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={submit} className='flex gap-2'>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className='h-8 text-xs'
        />
        <Button type="submit" size="sm" variant="subtle" className='h-8 shrink-0'>
          +
        </Button>
      </form>
    </div>
  );
}
