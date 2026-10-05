'use client';

import * as React from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, User, Mail, Shield, Zap, Save } from 'lucide-react';

interface ProfileData {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  membership: string;
  credits: number;
  createdAt: string;
}

function AvatarPreview({
  src, name, email, size = 80,
}: { src?: string | null; name?: string | null; email: string; size?: number }) {
  const initials = (name?.[0] || email[0]).toUpperCase();
  if (src) {
    return (
      <img src={src} alt={name || email} width={size} height={size}
        className="rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="flex items-center justify-center rounded-full bg-accent/15 text-accent font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

export function ProfileClient({ initialProfile }: { initialProfile: ProfileData }) {
  const { update: updateSession } = useSession();
  const toast = useToast();
  const [profile, setProfile] = React.useState<ProfileData>(initialProfile);
  const [name, setName] = React.useState(initialProfile.name || '');
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Avatar must be under 5MB', variant: 'error' });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const form = new FormData();
      form.append('name', name);
      if (avatarFile) form.append('avatar', avatarFile);
      const res = await fetch('/api/user/profile', { method: 'PATCH', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || 'Update failed');
      }
      const updated: ProfileData = await res.json();
      setProfile(updated);
      setAvatarFile(null);
      setAvatarPreview(null);
      await updateSession({ name: updated.name, image: updated.image });
      toast({ title: 'Profile updated', variant: 'success' });
    } catch (e: any) {
      toast({ title: e.message || 'Failed to update profile', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const isDirty = name !== (profile.name || '') || !!avatarFile;
  const currentAvatar = avatarPreview || profile.image;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Account</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Update your display name and profile picture.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
              <User className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Profile Info</CardTitle>
              <CardDescription>Change how you appear across the dashboard.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <AvatarPreview src={currentAvatar} name={name} email={profile.email} size={80} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-accent text-background shadow hover:bg-accent/80 transition-colors"
                aria-label="Change avatar">
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden" onChange={handleAvatarChange} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{profile.name || 'No name set'}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG, WebP or GIF — max 5MB</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display Name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name" maxLength={64} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email Address</Label>
            <div className="flex items-center gap-2">
              <Input id="profile-email" value={profile.email} readOnly
                className="cursor-not-allowed bg-muted/40 text-muted-foreground" />
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">Email cannot be changed here.</p>
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={handleSave} disabled={!isDirty || saving}>
              {saving
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                : <><Save className="mr-2 h-4 w-4" />Save Changes</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Account Details</CardTitle>
              <CardDescription>Your plan, role, and membership info.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card-2 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Membership</p>
              <div className="mt-1.5">
                <Badge variant={profile.membership === 'FREE' ? 'muted' : 'success'} className="capitalize">
                  {profile.membership.toLowerCase()}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card-2 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Role</p>
              <div className="mt-1.5">
                <Badge variant={profile.role === 'ADMIN' ? 'info' : 'muted'} className="capitalize">
                  {profile.role.toLowerCase()}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card-2 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Credits</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-accent" />
                <span className="font-mono text-sm font-semibold text-foreground">{profile.credits}</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Member since{' '}
            {new Date(profile.createdAt).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
