'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';

type SectionDef = { key: string; label: string; icon: string };
type ContentMap = Record<
  string,
  { sectionKey: string; contentJson: any; isActive?: boolean; sortOrder?: number }
>;

const DEFAULT_CONTENT: Record<string, any> = {
  hero: {
    headline: 'StockForge AI',
    subheadline: 'Generate AI metadata...',
    ctaPrimary: { label: 'Start free', href: '/login' },
    ctaSecondary: { label: 'View pricing', href: '/pricing' },
    badge: 'New: Adobe Stock analytics now in beta',
  },
  features: { items: [{ icon: 'Sparkles', title: 'Feature', description: 'Description' }] },
  testimonials: { items: [{ name: 'Name', role: 'Role', quote: 'Quote', avatar: 'XX' }] },
  faq: { items: [{ question: 'Question', answer: 'Answer' }] },
};

export function HomepageClient({
  sections,
  initialContent,
}: {
  sections: SectionDef[];
  initialContent: ContentMap;
}) {
  const [activeTab, setActiveTab] = React.useState(sections[0]?.key || '');
  const [content, setContent] = React.useState<Record<string, any>>(() => {
    const result: Record<string, any> = {};
    sections.forEach((s) => {
      result[s.key] = initialContent[s.key]?.contentJson || DEFAULT_CONTENT[s.key] || {};
    });
    return result;
  });
  const [isActive, setIsActive] = React.useState<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};
    sections.forEach((s) => {
      result[s.key] = initialContent[s.key]?.isActive ?? true;
    });
    return result;
  });
  const queryClient = useQueryClient();
  const toast = useToast();

  const saveMutation = useMutation({
    mutationFn: async (sectionKey: string) => {
      const res = await fetch(`/api/admin/homepage/${sectionKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentJson: content[sectionKey], isActive: isActive[sectionKey] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'save_failed');
      return res.json();
    },
    onSuccess: (_, key) => {
      toast({
        title: 'Saved',
        description: `${sections.find((s) => s.key === key)?.label || key} updated successfully.`,
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['homepage'] });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const updateField = (section: string, path: string, value: any) => {
    setContent((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = updated[section];
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return updated;
    });
  };

  const renderHeroForm = () => (
    <div className="space-y-4">
      <div>
        <Label>Headline</Label>
        <Input
          value={content.hero?.headline || ''}
          onChange={(e) => updateField('hero', 'headline', e.target.value)}
        />
      </div>
      <div>
        <Label>Subheadline</Label>
        <Textarea
          value={content.hero?.subheadline || ''}
          onChange={(e) => updateField('hero', 'subheadline', e.target.value)}
        />
      </div>
      <div>
        <Label>Badge Text</Label>
        <Input
          value={content.hero?.badge || ''}
          onChange={(e) => updateField('hero', 'badge', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>CTA Primary Label</Label>
          <Input
            value={content.hero?.ctaPrimary?.label || ''}
            onChange={(e) => updateField('hero', 'ctaPrimary.label', e.target.value)}
          />
        </div>
        <div>
          <Label>CTA Primary Link</Label>
          <Input
            value={content.hero?.ctaPrimary?.href || ''}
            onChange={(e) => updateField('hero', 'ctaPrimary.href', e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>CTA Secondary Label</Label>
          <Input
            value={content.hero?.ctaSecondary?.label || ''}
            onChange={(e) => updateField('hero', 'ctaSecondary.label', e.target.value)}
          />
        </div>
        <div>
          <Label>CTA Secondary Link</Label>
          <Input
            value={content.hero?.ctaSecondary?.href || ''}
            onChange={(e) => updateField('hero', 'ctaSecondary.href', e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const renderFeaturesForm = () => {
    const items = content.features?.items || [];
    return (
      <div className="space-y-4">
        {items.map((_: any, idx: number) => (
          <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Feature {idx + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = JSON.parse(JSON.stringify(content));
                  next.features.items.splice(idx, 1);
                  setContent(next);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <Label>Icon (Sparkles, Image, BarChart3, Wrench, Zap, Star)</Label>
              <Input
                value={items[idx]?.icon || ''}
                onChange={(e) => updateField('features', `items.${idx}.icon`, e.target.value)}
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={items[idx]?.title || ''}
                onChange={(e) => updateField('features', `items.${idx}.title`, e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={items[idx]?.description || ''}
                onChange={(e) =>
                  updateField('features', `items.${idx}.description`, e.target.value)
                }
              />
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => {
            const next = JSON.parse(JSON.stringify(content));
            next.features.items = [
              ...(next.features.items || []),
              { icon: 'Sparkles', title: 'New Feature', description: 'Description' },
            ];
            setContent(next);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Feature
        </Button>
      </div>
    );
  };

  const renderTestimonialsForm = () => {
    const items = content.testimonials?.items || [];
    return (
      <div className="space-y-4">
        {items.map((_: any, idx: number) => (
          <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Testimonial {idx + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = JSON.parse(JSON.stringify(content));
                  next.testimonials.items.splice(idx, 1);
                  setContent(next);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={items[idx]?.name || ''}
                onChange={(e) => updateField('testimonials', `items.${idx}.name`, e.target.value)}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Input
                value={items[idx]?.role || ''}
                onChange={(e) => updateField('testimonials', `items.${idx}.role`, e.target.value)}
              />
            </div>
            <div>
              <Label>Avatar Initials</Label>
              <Input
                value={items[idx]?.avatar || ''}
                onChange={(e) => updateField('testimonials', `items.${idx}.avatar`, e.target.value)}
              />
            </div>
            <div>
              <Label>Quote</Label>
              <Textarea
                value={items[idx]?.quote || ''}
                onChange={(e) => updateField('testimonials', `items.${idx}.quote`, e.target.value)}
              />
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => {
            const next = JSON.parse(JSON.stringify(content));
            next.testimonials.items = [
              ...(next.testimonials.items || []),
              { name: 'Name', role: 'Role', quote: 'Quote', avatar: 'XX' },
            ];
            setContent(next);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Testimonial
        </Button>
      </div>
    );
  };

  const renderFaqForm = () => {
    const items = content.faq?.items || [];
    return (
      <div className="space-y-4">
        {items.map((_: any, idx: number) => (
          <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">FAQ {idx + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = JSON.parse(JSON.stringify(content));
                  next.faq.items.splice(idx, 1);
                  setContent(next);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <Label>Question</Label>
              <Input
                value={items[idx]?.question || ''}
                onChange={(e) => updateField('faq', `items.${idx}.question`, e.target.value)}
              />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea
                value={items[idx]?.answer || ''}
                onChange={(e) => updateField('faq', `items.${idx}.answer`, e.target.value)}
              />
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => {
            const next = JSON.parse(JSON.stringify(content));
            next.faq.items = [
              ...(next.faq.items || []),
              { question: 'Question', answer: 'Answer' },
            ];
            setContent(next);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add FAQ
        </Button>
      </div>
    );
  };

  const renderForm = (key: string) => {
    switch (key) {
      case 'hero':
        return renderHeroForm();
      case 'features':
        return renderFeaturesForm();
      case 'testimonials':
        return renderTestimonialsForm();
      case 'faq':
        return renderFaqForm();
      default:
        return <p className="text-muted-foreground">No form for {key}</p>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Homepage
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">CMS Editor</h1>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto">
          {sections.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s.key} value={s.key}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{s.label}</CardTitle>
                    <CardDescription>Edit content for this section</CardDescription>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive[s.key] ?? true}
                      onChange={(e) =>
                        setIsActive((prev) => ({ ...prev, [s.key]: e.target.checked }))
                      }
                      className="rounded"
                    />
                    Active
                  </label>
                </div>
              </CardHeader>
              <CardContent>{renderForm(s.key)}</CardContent>
              <CardContent className="pt-0">
                <Button
                  onClick={() => saveMutation.mutate(s.key)}
                  disabled={saveMutation.isPending}
                  className="mt-4"
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
