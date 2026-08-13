import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { saveProfile, uploadPublicFile } from '@/lib/data';
import { activateCompanyAccount } from '@/lib/payments';
import { useToast } from '@/lib/toast';
import { User, Image as ImageIcon, Save, Plus, X, Building2, Upload, Trash2 } from 'lucide-react';
import { AdminBadge } from '@/components/AdminBadge';
import { Select } from '@/components/Select';
import type { Profile } from '@/lib/supabase';

const BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'AI', 'Mech'];

export function ProfileView() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [branch, setBranch] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setBio(profile.bio || '');
      setCgpa(profile.cgpa != null && Number(profile.cgpa) > 0 ? String(profile.cgpa) : '');
      setBranch(profile.branch || '');
      const sk = profile.skills;
      setSkills(Array.isArray(sk) ? sk : []);
      setAvatarUrl(profile.avatar_url || '');
      setBannerUrl(profile.banner_url || '');
    }
  }, [profile]);

  const addSkills = () => {
    const parsed = skillsText.split(',').map((s) => s.trim()).filter(Boolean);
    const newSkills = [...new Set([...skills, ...parsed])];
    setSkills(newSkills);
    setSkillsText('');
  };

  const removeSkill = (s: string) => setSkills(skills.filter((sk) => sk !== s));

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const url = await uploadPublicFile('avatars', file, profile.id);
    if (url) {
      setAvatarUrl(url);
      await saveProfile(profile.id, profile.email, { avatar_url: url });
      refreshProfile();
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

  const startActivation = async () => {
    setActivating(true);
    const result = await activateCompanyAccount();
    setActivating(false);
    if (result.success) {
      await refreshProfile();
      showToast('Your Company account is ready!', 'success');
      return;
    }
    showToast(result.error, 'error');
  };

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
      <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
        <div className="card overflow-hidden">
          <div className="relative h-32 rounded-t-2xl overflow-hidden border-b border-[var(--border)] bg-[var(--surface-hover)]">
            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[var(--accent)]/25 to-[var(--accent-2)]/25 backdrop-blur-sm">
                <ImageIcon size={22} className="text-[var(--text-muted)]" />
                <p className="text-xs text-[var(--text-muted)]">Your banner will appear here</p>
              </div>
            )}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
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
            <div className="relative -mt-10 mb-4 inline-block">
              <div className="h-20 w-20 rounded-2xl border-4 border-[var(--bg-elevated)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] overflow-hidden flex items-center justify-center">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <User size={28} className="text-white" />}
              </div>
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--accent)]">
                <Upload size={14} />
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleAvatar} />
              </label>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  title="Remove avatar"
                  className="absolute -bottom-1 -right-9 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-400"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {(profile.role === 'admin' || profile.role === 'owner') && (
              <div className="mb-2">
                <AdminBadge role={profile.role} />
              </div>
            )}
            <p className="text-sm text-[var(--text-muted)]">Optional — banner and avatar appear on your public student profile.</p>
          </div>
        </div>

        <div className="card space-y-5">
        <h2 className="text-lg font-semibold">Academic Profile</h2>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Full Name</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className="input-field" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="A short intro about you — your interests, goals, what makes you stand out." className="input-field" />
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
          <input type="email" value={profile?.email || ''} readOnly className="input-field" />
          <p className="mt-1 text-xs text-[var(--text-muted)]">This is your login email and can't be changed here.</p>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          <Save size={16} /> {saving ? 'Saving…' : 'Save Profile'}
        </button>
        </div>
      </form>

      <div className="space-y-6">
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">Skills</h2>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Add skills (comma separated)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkills(); } }}
                placeholder="React, Python, SQL"
                className="input-field"
              />
              <button type="button" onClick={addSkills} className="btn-primary btn-sm flex-shrink-0">
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
