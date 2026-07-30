import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { saveProfile, uploadPublicFile } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { User, Image, Save, Plus, X, Building2 } from 'lucide-react';
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

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setBio(profile.bio || '');
      setCgpa(profile.cgpa ? String(profile.cgpa) : '');
      setBranch(profile.branch || '');
      setSkills(profile.skills || []);
      setAvatarUrl(profile.avatar_url || '');
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
      await saveProfile(profile.id, profile.email, { banner_url: url });
      refreshProfile();
      showToast('Banner updated', 'success');
    } else {
      showToast('Upload failed', 'error');
    }
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

  const becomeCompany = async () => {
    if (!profile) return;
    if (!confirm('Switch this account to a Company account? You will get a Company Profile, Applicants, and Messages. You can keep using the same login.')) return;
    const { error } = await supabase.from('profiles').upsert({ id: profile.id, email: profile.email, role: 'company' }, { onConflict: 'id' });
    if (error) {
      showToast('Could not switch account: ' + error.message, 'error');
      return;
    }
    await supabase.from('company_profiles').upsert({ id: profile.id }, { onConflict: 'id', ignoreDuplicates: true });
    refreshProfile();
    showToast('Company account ready — set up your profile', 'success');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={handleSubmit} className="card lg:col-span-2 space-y-5">
        <h2 className="text-lg font-semibold">Academic Profile</h2>

        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col items-center gap-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Avatar</label>
            <div className="h-20 w-20 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] overflow-hidden flex items-center justify-center">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <User size={28} className="text-[var(--text-muted)]" />}
            </div>
            <label className="btn-ghost btn-sm cursor-pointer">
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleAvatar} />
              Choose Avatar
            </label>
          </div>
          <div className="flex flex-col items-center gap-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Banner</label>
            <div className="h-20 w-32 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] overflow-hidden flex items-center justify-center">
              {profile?.banner_url ? <img src={profile.banner_url} alt="" className="h-full w-full object-cover" /> : <Image size={24} className="text-[var(--text-muted)]" />}
            </div>
            <label className="btn-ghost btn-sm cursor-pointer">
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleBanner} />
              Choose Banner
            </label>
          </div>
        </div>

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
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="input-field">
              <option value="">Select branch</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
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
          <button onClick={becomeCompany} className="btn-ghost w-full">
            Set up a Company Profile
          </button>
        </div>
      </div>
    </div>
  );
}
