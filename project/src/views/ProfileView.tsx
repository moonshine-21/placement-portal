// ============================================================================
// src/views/ProfileView.tsx
//
// WHAT THIS FILE IS: the student's own editable profile page — name, bio,
// CGPA, branch, skills, avatar, and banner — plus the "Set up a Company
// Profile" button that upgrades this account into a company account (see
// src/lib/companyActivation.ts and api/company-activate.ts, which is the
// only actual place the role change is allowed to happen).
// ============================================================================

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { saveProfile, uploadPublicFile } from '@/lib/data';
import { activateCompanyAccount } from '@/lib/companyActivation';
import { useToast } from '@/lib/toast';
import { User, Image as ImageIcon, Save, Plus, X, Building2, Upload, Trash2 } from 'lucide-react';
import { AdminBadge } from '@/components/AdminBadge';
import { Select } from '@/components/Select';
import type { Profile } from '@/lib/supabase';

// The fixed list of branches students can pick from — kept simple as a
// hardcoded list rather than a database table, since this rarely changes.
const BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'AI', 'Mech'];

// Caps that keep a profile card from being able to grow unboundedly large
// (a bio or skill list with no ceiling was blowing up the profile popover's
// size elsewhere in the app) — enforced here at the source, on save.
const BIO_MAX_CHARS = 1000;
const SKILLS_MAX = 40;

export function ProfileView() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  // One piece of state per editable field. These start empty and get
  // filled in from `profile` once it loads (see the effect below) —
  // that's why this component has BOTH `profile` (the saved database
  // data) AND these separate pieces of state (the form's current,
  // possibly-unsaved, editable values).
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [branch, setBranch] = useState('');
  const [skillsText, setSkillsText] = useState(''); // the raw text currently typed into the "add skills" input
  const [skills, setSkills] = useState<string[]>([]); // the actual saved list of skill chips shown below it
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');

  // Whenever `profile` loads (or changes — e.g. after refreshProfile()),
  // copy its values into this form's local editable state.
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setBio(profile.bio || '');
      // Only show a CGPA value if it's actually set and greater than 0 —
      // otherwise leave the field blank rather than showing a confusing "0".
      setCgpa(profile.cgpa != null && Number(profile.cgpa) > 0 ? String(profile.cgpa) : '');
      setBranch(profile.branch || '');
      const sk = profile.skills;
      setSkills(Array.isArray(sk) ? sk : []);
      setAvatarUrl(profile.avatar_url || '');
      setBannerUrl(profile.banner_url || '');
    }
  }, [profile]);

  // Parses the comma-separated skills text box and adds each new skill to
  // the list — this doesn't save to the database yet, just updates the
  // LOCAL list of chips; the actual save happens when the whole form is submitted.
  const addSkills = () => {
    const parsed = skillsText.split(',').map((s) => s.trim()).filter(Boolean);
    // `new Set([...skills, ...parsed])` combines the existing skills with
    // the newly typed ones and automatically removes any duplicates (a
    // Set can't contain the same value twice) — then `[...new Set(...)]`
    // converts it back into a plain array, since that's what the rest of
    // the component expects.
    const newSkills = [...new Set([...skills, ...parsed])];
    if (newSkills.length > SKILLS_MAX) {
      showToast(`You can add up to ${SKILLS_MAX} skills`, 'error');
      setSkills(newSkills.slice(0, SKILLS_MAX));
    } else {
      setSkills(newSkills);
    }
    setSkillsText(''); // clear the input box after adding
  };

  const removeSkill = (s: string) => setSkills(skills.filter((sk) => sk !== s));

  // Avatar/banner uploads save IMMEDIATELY on selection (unlike the rest
  // of the form, which only saves when "Save Profile" is clicked) — this
  // gives instant visual feedback and matches how most apps handle photo
  // uploads (you don't expect to have to click a separate "save" button
  // after picking a new profile picture).
  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const url = await uploadPublicFile('avatars', file, profile.id);
    if (url) {
      setAvatarUrl(url);
      await saveProfile(profile.id, profile.email, { avatar_url: url });
      refreshProfile(); // tells the REST of the app (e.g. AppShell's header) about the new photo too
      showToast('Avatar updated', 'success');
    } else {
      showToast('Upload failed', 'error');
    }
  };

  const handleBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const url = await uploadPublicFile('banners', file, profile.id);
    if (url) {
      setBannerUrl(url);
      await saveProfile(profile.id, profile.email, { banner_url: url });
      refreshProfile();
      showToast('Banner updated', 'success');
    } else {
      showToast('Upload failed', 'error');
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile) return;
    setAvatarUrl('');
    await saveProfile(profile.id, profile.email, { avatar_url: '' });
    refreshProfile();
    showToast('Avatar removed', 'success');
  };

  const handleRemoveBanner = async () => {
    if (!profile) return;
    setBannerUrl('');
    await saveProfile(profile.id, profile.email, { banner_url: '' });
    refreshProfile();
    showToast('Banner removed', 'success');
  };

  // Saves the main form fields (name, bio, CGPA, branch, skills) — this
  // is the one action that requires an explicit "Save Profile" click,
  // unlike the avatar/banner uploads above.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const updates: Partial<Profile> = {
      full_name: fullName,
      bio,
      cgpa: parseFloat(cgpa) || 0,
      branch,
      skills,
    };
    const { error } = await saveProfile(profile.id, profile.email, updates);
    setSaving(false);
    if (error) {
      showToast('Could not save profile: ' + error.message, 'error');
    } else {
      refreshProfile();
      showToast('Profile saved', 'success');
    }
  };

  const [activating, setActivating] = useState(false);

  // Triggers the (free, one-click) upgrade to a Company account — see
  // src/lib/companyActivation.ts for the full explanation of why this
  // has to go through a server call rather than just updating the role directly.
  const startActivation = async () => {
    setActivating(true);
    const result = await activateCompanyAccount();
    setActivating(false);
    if (result.success) {
      await refreshProfile(); // this is what makes App.tsx immediately notice the role change and switch to the company-side views
      showToast('Your Company account is ready!', 'success');
      return;
    }
    showToast(result.error, 'error');
  };

  // If the profile hasn't loaded yet (e.g. a brief moment right after
  // logging in), show a small loading state with a manual retry button
  // rather than a blank/broken-looking form.
  if (!profile) {
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center">
        <User size={32} className="text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-muted)]">Loading your profile…</p>
        <button type="button" onClick={() => refreshProfile()} className="btn-ghost btn-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* The main editable form takes up 2 of 3 columns on large
          screens (`lg:col-span-2`); the sidebar (skills + company
          upgrade) takes the remaining 1. */}
      <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
        {/* ---------- Banner + avatar ---------- */}
        <div className="card overflow-hidden">
          <div className="relative h-32 rounded-t-2xl overflow-hidden border-b border-[var(--border)] bg-[var(--surface-hover)]">
            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[var(--accent)]/25 to-[var(--accent-2)]/25">
                <ImageIcon size={22} className="text-[var(--text-muted)]" />
                <p className="text-xs text-[var(--text-muted)]">Your banner will appear here</p>
              </div>
            )}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {/* Remove button only shown once there's actually a banner to remove. */}
              {bannerUrl && (
                <button
                  type="button"
                  onClick={handleRemoveBanner}
                  className="flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-rose-500/60"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-black/60">
                <Upload size={14} /> Change banner
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleBanner} />
              </label>
            </div>
          </div>
          <div className="px-6 pb-6">
            {/* `relative` (with the default z-index:auto) is the fix here
                — without it, this plain in-flow div was painting BEHIND
                the banner box above even though it comes later in the
                DOM. That's a CSS stacking rule, not DOM order: within a
                stacking context, a `position: relative` element (the
                banner box, which needs that for its absolute-positioned
                buttons) always paints above a plain, non-positioned
                sibling — regardless of which one appears first in the
                markup. Giving this div `relative` too puts it in that
                same "positioned" paint layer, where DOM order (this div
                comes after) decides the outcome instead, so it now
                correctly renders ON TOP of the banner wherever the
                negative margin below makes them overlap. */}
            {/* `w-fit` here matters just as much as `relative` — without
                it, this flex container defaults to full row width (even
                though only the avatar+buttons on the left have visible
                content), and being `relative` now makes its ENTIRE box
                paint above the banner in the overlap strip below. That
                invisible right-hand portion was sitting directly over
                the banner's "Change banner" button and swallowing every
                click meant for it. `w-fit` shrinks the box down to just
                its actual content, so it only "wins" the stacking order
                where the avatar really is. */}
            <div className="relative -mt-10 mb-4 flex w-fit items-end gap-2">
              <div className="h-20 w-20 flex-shrink-0 rounded-2xl border-4 border-[var(--bg-elevated)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] overflow-hidden flex items-center justify-center">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <User size={28} className="text-white" />}
              </div>
              {/* Upload/remove buttons sit BESIDE the avatar square (not
                  layered on top of it) so they never overlap the photo or
                  each other, and stay put regardless of avatar size. */}
              <div className="flex items-center gap-1.5 pb-1">
                <label
                  title="Change avatar"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
                >
                  <Upload size={14} />
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleAvatar} />
                </label>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    title="Remove avatar"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-400"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            {(profile.role === 'admin' || profile.role === 'owner') && (
              <div className="mb-2">
                <AdminBadge role={profile.role} />
              </div>
            )}
            <p className="text-sm text-[var(--text-muted)]">Optional — banner and avatar appear on your public student profile.</p>
          </div>
        </div>

        {/* ---------- Core academic fields ---------- */}
        <div className="card space-y-5">
        <h2 className="text-lg font-semibold">Academic Profile</h2>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Full Name</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className="input-field" />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">Bio</label>
            <span className="text-xs text-[var(--text-muted)]">{bio.length}/{BIO_MAX_CHARS}</span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_CHARS))}
            maxLength={BIO_MAX_CHARS}
            rows={3}
            placeholder="A short intro about you — your interests, goals, what makes you stand out."
            className="input-field"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">CGPA</label>
            <input type="number" step="0.01" min="0" max="10" value={cgpa} onChange={(e) => setCgpa(e.target.value)} placeholder="8.5" className="input-field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Branch</label>
            <Select value={branch} onChange={setBranch} options={BRANCHES} placeholder="Select branch" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Email</label>
          {/* `readOnly` here — email is the account's LOGIN identity, so
              changing it has to go through Supabase's proper
              email-change flow (see SettingsView.tsx's changeEmail),
              never just typed and saved here directly. */}
          <input type="email" value={profile?.email || ''} readOnly className="input-field" />
          <p className="mt-1 text-xs text-[var(--text-muted)]">This is your login email and can't be changed here.</p>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          <Save size={16} /> {saving ? 'Saving…' : 'Save Profile'}
        </button>
        </div>
      </form>

      {/* ---------- Sidebar: skills + company upgrade ---------- */}
      <div className="space-y-6">
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">Skills</h2>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-[var(--text-secondary)]">Add skills (comma separated)</label>
              <span className="text-xs text-[var(--text-muted)]">{skills.length}/{SKILLS_MAX}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillsText}
                disabled={skills.length >= SKILLS_MAX}
                onChange={(e) => setSkillsText(e.target.value)}
                // Pressing Enter in this field adds the skills, same as
                // clicking the Add button — `e.preventDefault()` stops it
                // from also submitting the WHOLE outer form (this input
                // isn't inside the <form> above, but this guard is a
                // simple safety habit worth keeping regardless).
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkills(); } }}
                placeholder="React, Python, SQL"
                className="input-field"
              />
              <button type="button" onClick={addSkills} disabled={skills.length >= SKILLS_MAX} className="btn-primary btn-sm flex-shrink-0 disabled:opacity-50">
                <Plus size={16} /> Add
              </button>
            </div>
          </div>
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--accent)]">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="hover:text-rose-400">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-[var(--text-muted)]">Skills are auto-detected from your resume when you upload one.</p>
        </div>

        {/* ---------- The company-account upgrade box ---------- */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold">Hiring for your organization?</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Switch this account into a company account to create a public company profile, receive applications, and message candidates. Your student profile stays saved.</p>
          <button onClick={startActivation} disabled={activating} className="btn-ghost w-full">
            {activating ? 'Activating…' : 'Set up a Company Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
