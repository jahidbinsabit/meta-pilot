'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Cpu, Bot } from 'lucide-react';
import type { UserRecord, EditUserFormState } from './user-types';

interface UserEditAiKeysTabProps {
  user: UserRecord;
  form: EditUserFormState;
  setForm: React.Dispatch<React.SetStateAction<EditUserFormState>>;
}

function KeyField({
  label,
  icon: Icon,
  badgeVariant,
  hasKey,
  clearKey,
  keyValue,
  placeholder,
  onChangeKey,
  onToggleClear,
}: {
  label: string;
  icon: React.ElementType;
  badgeVariant: 'info' | 'success' | 'warning';
  hasKey?: boolean;
  clearKey: boolean;
  keyValue: string;
  placeholder: string;
  onChangeKey: (val: string) => void;
  onToggleClear: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs font-semibold">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Label>
        {hasKey && !clearKey && (
          <Badge variant={badgeVariant} className="text-[10px]">Configured</Badge>
        )}
      </div>
      <Input
        type="password"
        value={keyValue}
        onChange={(e) => onChangeKey(e.target.value)}
        placeholder={hasKey ? '•••••••••••••••• (Leave blank to keep)' : placeholder}
      />
      {hasKey && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">Remove stored key</span>
          <Button
            type="button"
            variant={clearKey ? 'destructive' : 'ghost'}
            size="xs"
            onClick={onToggleClear}
          >
            {clearKey ? 'Will be removed on save' : 'Clear key'}
          </Button>
        </div>
      )}
    </div>
  );
}

export function UserEditAiKeysTab({ user, form, setForm }: UserEditAiKeysTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-1.5">
        <Label htmlFor="edit-ai-provider" className="text-xs">Preferred AI Engine</Label>
        <Select
          value={form.preferredAiProvider}
          onValueChange={(val) =>
            setForm((prev) => ({ ...prev, preferredAiProvider: val }))
          }
        >
          <SelectTrigger id="edit-ai-provider">
            <SelectValue placeholder="Select Preferred AI" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Google Gemini 2.5 Flash</SelectItem>
            <SelectItem value="openai">OpenAI GPT-4o-mini</SelectItem>
            <SelectItem value="grok">xAI Grok 2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <KeyField
        label="Google Gemini API Key"
        icon={Sparkles}
        badgeVariant="info"
        hasKey={user.hasGeminiKey}
        clearKey={form.clearGeminiKey}
        keyValue={form.geminiApiKey}
        placeholder="Enter AIzaSy..."
        onChangeKey={(val) => setForm((p) => ({ ...p, geminiApiKey: val, clearGeminiKey: false }))}
        onToggleClear={() => setForm((p) => ({ ...p, clearGeminiKey: !p.clearGeminiKey, geminiApiKey: '' }))}
      />

      <KeyField
        label="OpenAI API Key"
        icon={Cpu}
        badgeVariant="success"
        hasKey={user.hasOpenaiKey}
        clearKey={form.clearOpenaiKey}
        keyValue={form.openaiApiKey}
        placeholder="Enter sk-..."
        onChangeKey={(val) => setForm((p) => ({ ...p, openaiApiKey: val, clearOpenaiKey: false }))}
        onToggleClear={() => setForm((p) => ({ ...p, clearOpenaiKey: !p.clearOpenaiKey, openaiApiKey: '' }))}
      />

      <KeyField
        label="xAI Grok API Key"
        icon={Bot}
        badgeVariant="warning"
        hasKey={user.hasGrokKey}
        clearKey={form.clearGrokKey}
        keyValue={form.grokApiKey}
        placeholder="Enter xai-..."
        onChangeKey={(val) => setForm((p) => ({ ...p, grokApiKey: val, clearGrokKey: false }))}
        onToggleClear={() => setForm((p) => ({ ...p, clearGrokKey: !p.clearGrokKey, grokApiKey: '' }))}
      />
    </div>
  );
}
