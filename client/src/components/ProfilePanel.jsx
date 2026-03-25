import React, { useState } from 'react';
import {
  User, Mail, Lock, Check, AlertCircle, RefreshCw, Calendar, Shield, KeyRound, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label, Separator,
} from './ui-primitives';
import { Button } from './ui-button';
import { Badge } from './ui-primitives';
import { cn } from '../lib/utils';
import { PLANS, PLAN_LABELS, PricingCards } from './PricingPanel';

const API = 'http://localhost:5001';

export default function ProfilePanel() {
  const { user, token, updateUser } = useAuth();

  // ── Profile ───────────────────────────────────────────────────────────────
  const [name, setName]                     = useState(user?.name || '');
  const [profileSaving, setProfileSaving]   = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError]     = useState(null);

  const saveProfile = async () => {
    if (!name.trim() || name.trim() === user?.name) return;
    setProfileSaving(true); setProfileError(null); setProfileSuccess(false);
    try {
      const res = await fetch(`${API}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      updateUser({ name: data.name });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (e) { setProfileError(e.message); }
    finally { setProfileSaving(false); }
  };

  // ── Password ──────────────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError]     = useState(null);

  const changePassword = async () => {
    setPwError(null); setPwSuccess(false);
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    if (newPw.length < 6)   { setPwError('New password must be at least 6 characters'); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`${API}/api/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e) { setPwError(e.message); }
    finally { setPwSaving(false); }
  };

  const currentPlan = user?.plan || 'free';
  const joinedDate  = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* ── Avatar + summary ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-5">
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-border flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-2xl font-bold text-primary-foreground flex-shrink-0">
                {user?.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">{user?.name}</h2>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {joinedDate && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" /> Joined {joinedDate}
                  </span>
                )}
                <span className={cn(
                  "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border",
                  user?.hasPassword
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                )}>
                  <Shield className="w-3 h-3" />
                  {user?.hasPassword ? 'Password account' : 'Google account'}
                </span>
                {currentPlan !== 'free' && (
                  <span className={cn(
                    "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border",
                    PLANS.find(p => p.id === currentPlan)?.badgeClass
                  )}>
                    <Sparkles className="w-3 h-3" />
                    {PLAN_LABELS[currentPlan]}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Profile details ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> Profile Details
          </CardTitle>
          <CardDescription>Update your display name</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <User className="w-3 h-3" /> Display Name
            </Label>
            <div className="flex gap-2">
              <Input value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveProfile()}
                placeholder="Your name" className="flex-1" />
              <Button onClick={saveProfile}
                disabled={profileSaving || !name.trim() || name.trim() === user?.name}
                className="flex-shrink-0">
                {profileSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : profileSuccess ? <Check className="w-4 h-4" /> : 'Save'}
              </Button>
            </div>
            {profileError && <p className="text-xs text-destructive flex items-center gap-1.5 mt-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />{profileError}</p>}
            {profileSuccess && <p className="text-xs text-green-400 flex items-center gap-1.5 mt-1"><Check className="w-3 h-3" />Name updated</p>}
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> Email Address
            </Label>
            <Input value={user?.email || ''} disabled className="opacity-60 cursor-not-allowed" />
            <p className="text-xs text-muted-foreground/60">Email cannot be changed</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Change password ── */}
      {user?.hasPassword ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> Change Password
            </CardTitle>
            <CardDescription>Choose a new password for your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Current Password</Label>
              <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">New Password</Label>
                <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Confirm New</Label>
                <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="••••••••" autoComplete="new-password"
                  onKeyDown={e => e.key === 'Enter' && changePassword()} />
              </div>
            </div>
            {newPw && confirmPw && newPw !== confirmPw && (
              <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3 h-3 flex-shrink-0" />Passwords do not match</p>
            )}
            {pwError   && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3 h-3 flex-shrink-0" />{pwError}</p>}
            {pwSuccess && <p className="text-xs text-green-400 flex items-center gap-1.5"><Check className="w-3 h-3" />Password changed successfully</p>}
            <Button onClick={changePassword} disabled={pwSaving || !currentPw || !newPw || !confirmPw} className="w-full">
              {pwSaving
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Updating…</>
                : <><Lock className="w-4 h-4" /> Update Password</>}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-foreground">Signed in with Google</p>
                <p className="text-xs mt-0.5">Password management is handled by your Google account</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Plans ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Plan &amp; Billing</h2>
        </div>
        <PricingCards />
      </div>

    </div>
  );
}
