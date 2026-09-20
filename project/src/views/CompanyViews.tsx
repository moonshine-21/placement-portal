// ============================================================================
// src/views/CompanyViews.tsx
//
// WHAT THIS FILE IS: two related company-side pages, kept in one file
// since they're both simple and both about "managing your own company
// account": `CompanyOverviewView` (a stats dashboard — applicant counts,
// hiring progress, recent applicants) and `CompanyProfileEditorView` (the
// form for editing your company's public profile — logo, banner, bio,
// contact info).
// ============================================================================

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { uploadPublicFile, saveProfile } from '@/lib/data';
import { Building2, Upload, Save, Users, TrendingUp, Award, Briefcase, Trash2, Image as ImageIcon } from 'lucide-react';
import type { CompanyProfile, CompanyApplication } from '@/lib/supabase';

// ============================================================================
// CompanyOverviewView — the company's "Dashboard" landing page
// ============================================================================
export function CompanyOverviewView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { profile } = useAuth();
  const [apps, setApps] = useState<CompanyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [hired, setHired] = useState(0);
  const [needed, setNeeded] = useState(0);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      // Fetch this company's full application list.
      const { data: a } = await supabase.from('company_applications').select('*').eq('company_id', profile.id).order('created_at', { ascending: false });
      const all = (a as CompanyApplication[]) || [];
      setApps(all);

      // Hiring progress is a COMBINATION of two sources: the company's
      // own overall "employees needed/have" numbers (set directly on
      // their company_profiles row) PLUS the sum of every individual
      // job's own needed/have counts (see JobsView.tsx). Both get added
      // together here into one combined total.
      const { data: cp } = await supabase.from('company_profiles').select('employees_needed, employees_have').eq('id', profile.id).maybeSingle();
      const { data: jobs } = await supabase.from('jobs').select('employees_needed, employees_have').eq('company_id', profile.id);
      let have = (cp as CompanyProfile)?.employees_have || 0;
      let need = (cp as CompanyProfile)?.employees_needed || 0;
      (jobs || []).forEach((j: any) => { have += j.employees_have || 0; need += j.employees_needed || 0; });

      // Sanity check: if the ACTUAL count of applications marked "hired"
      // is somehow higher than the manually-tracked "have" number (e.g.
      // the company forgot to update their employees_have field), trust
      // the real application data instead — this keeps the displayed
      // number from looking obviously wrong/stale.
      const hiredCount = all.filter((a) => a.status === 'hired').length;
      if (hiredCount > have) have = hiredCount;
      setHired(have); setNeeded(need);
      setLoading(false);
    })();
  }, [profile]);

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}</div>;

  // Everything below this line is plain arithmetic on the data already
  // loaded above — no more database calls needed.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newCount = apps.filter((a) => new Date(a.created_at).getTime() >= weekAgo).length;
  const shortlisted = apps.filter((a) => a.status === 'shortlisted').length;
  const progress = needed > 0 ? Math.min(100, Math.round((hired / needed) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Four stat cards across the top. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
        <div className="card card-hover">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]"><Users size={20} /></div>
          <div className="text-2xl font-bold">{apps.length}</div>
          <div className="text-xs text-[var(--text-muted)]">Total applicants · All time</div>
        </div>
        <div className="card card-hover">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400"><TrendingUp size={20} /></div>
          <div className="text-2xl font-bold">{newCount}</div>
          <div className="text-xs text-[var(--text-muted)]">New this week</div>
        </div>
        <div className="card card-hover">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400"><Award size={20} /></div>
          <div className="text-2xl font-bold">{shortlisted}</div>
          <div className="text-xs text-[var(--text-muted)]">Shortlisted candidates</div>
        </div>
        <div className="card card-hover">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400"><Briefcase size={20} /></div>
          <div className="text-2xl font-bold">{hired}/{needed}</div>
          <div className="text-xs text-[var(--text-muted)] mb-2">Hiring progress</div>
          <div className="h-1.5 rounded-full bg-[var(--border-strong)] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* A quick preview of just the 5 most recent applicants, with a
          shortcut button to the full Applicants page. */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Applicants</h2>
          <button onClick={() => onNavigate('applicants')} className="btn-primary btn-sm">View all</button>
        </div>
        {apps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Users size={28} className="text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No applicants yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {apps.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">{(a.full_name || 'A').slice(0, 2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.full_name || 'Applicant'}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{a.email || '—'}</p>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${a.status === 'shortlisted' ? 'bg-emerald-500/15 text-emerald-400' : a.status === 'hired' ? 'bg-purple-500/15 text-purple-400' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}>{a.status}</span>
                <span className="text-xs text-[var(--text-muted)] hidden sm:block">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CompanyProfileEditorView — edit the company's own public profile
// ============================================================================
export function CompanyProfileEditorView() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  // One piece of state per form field.
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [bio, setBio] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the existing company_profiles row (if any) and pre-fill every
  // field with it, so the form opens showing whatever's already saved.
  useEffect(() => {
    (async () => {
      if (!profile) return;
      const { data } = await supabase.from('company_profiles').select('*').eq('id', profile.id).maybeSingle();
      const cp = data as CompanyProfile | null;
      if (cp) {
        setOrgName(cp.org_name || ''); setIndustry(cp.industry || ''); setBio(cp.about_us || '');
        setAddress(cp.address || ''); setWebsite(cp.website || ''); setEmail(cp.contact_email || '');
        setPhone(cp.contact_phone || ''); setBannerUrl(cp.banner_url || ''); setAvatarUrl(cp.avatar_url || '');
      }
    })();
  }, [profile]);

  // The banner and logo images are BOTH uploaded and saved IMMEDIATELY
  // when picked (not held until the "Save" button is clicked) — this is
  // deliberate: image uploads are their own separate, independent action
  // from the rest of the text-field form below.
  const handleBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const url = await uploadPublicFile('banners', file, profile.id);
    if (url) {
      setBannerUrl(url);
      await supabase.from('company_profiles').upsert({ id: profile.id, banner_url: url }, { onConflict: 'id' });
      showToast('Banner updated', 'success');
    }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const url = await uploadPublicFile('avatars', file, profile.id);
    if (url) {
      setAvatarUrl(url);
      await supabase.from('company_profiles').upsert({ id: profile.id, avatar_url: url }, { onConflict: 'id' });
      // The company's LOGO is also mirrored onto their base `profiles`
      // row's avatar_url — this is what makes their logo show up
      // consistently in places that only know about the generic
      // `profiles` table (like chat messages), not just on their
      // dedicated company profile page.
      await saveProfile(profile.id, profile.email, { avatar_url: url });
      refreshProfile();
      showToast('Logo updated', 'success');
    }
  };

  const handleRemoveBanner = async () => {
    if (!profile) return;
    setBannerUrl('');
    await supabase.from('company_profiles').upsert({ id: profile.id, banner_url: '' }, { onConflict: 'id' });
    showToast('Banner removed', 'success');
  };

  const handleRemoveAvatar = async () => {
    if (!profile) return;
    setAvatarUrl('');
    await supabase.from('company_profiles').upsert({ id: profile.id, avatar_url: '' }, { onConflict: 'id' });
    await saveProfile(profile.id, profile.email, { avatar_url: '' });
    refreshProfile();
    showToast('Logo removed', 'success');
  };

  // Saves all the TEXT fields at once (the images already save
  // themselves independently, as described above).
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const payload = { id: profile.id, org_name: orgName, industry, about_us: bio, address, website, contact_email: email, contact_phone: phone, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('company_profiles').upsert(payload, { onConflict: 'id' });
    setSaving(false);
    if (error) { showToast('Could not save: ' + error.message, 'error'); return; }
    // If the organization's display name changed, also update their
    // shared `profiles.full_name` — this is what shows up as the
    // "sender name" in chat and elsewhere outside the company profile
    // page itself.
    if (orgName && orgName !== profile.full_name) { await saveProfile(profile.id, profile.email, { full_name: orgName }); refreshProfile(); }
    showToast('Company profile saved — it is now visible to students', 'success');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ---------- Banner + logo editor ---------- */}
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
            {/* Remove button only shown if there's currently a banner to remove. */}
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
              <input type="file" accept="image/*" hidden onChange={handleBanner} />
            </label>
          </div>
        </div>
        <div className="px-6 pb-6">
          {/* The logo box still overlaps the bottom edge of the banner
              (`-mt-10`), a common profile-card visual pattern also seen
              in CompanyProfileCardModal.tsx — but its upload/remove
              controls now sit BESIDE it in a normal flex row instead of
              as small badges absolutely-positioned on its corner. The
              badge approach put those buttons half on top of the logo
              image itself (and, since this whole block sits over the
              banner, effectively behind/under it depending on upload
              order) rather than clearly next to it.

              `relative z-10` on this row is required, not decorative:
              the banner `<div>` above is `position: relative`, which
              makes it a POSITIONED element. Per the CSS stacking spec,
              ALL positioned elements paint above ALL non-positioned
              in-flow elements within the same containing block —
              regardless of DOM order. Without giving this row its own
              `position` too, the (non-positioned) logo row was losing
              to the (positioned) banner despite coming later in the
              markup, which is exactly why the banner appeared to sit "on
              top of" the logo instead of the other way around. */}
          <div className="flex items-end gap-4 -mt-10 mb-4 relative z-10">
            <div className="h-20 w-20 flex-shrink-0 rounded-2xl border-4 border-[var(--bg-elevated)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] overflow-hidden flex items-center justify-center">
              {/* `object-top` (rather than the default centered crop)
                  keeps the top of an uploaded photo in frame — the
                  bit most likely to matter for a logo/headshot-style
                  image — instead of a wide/tall upload getting
                  center-cropped and clipping exactly that. */}
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover object-top" /> : <Building2 size={28} className="text-white" />}
            </div>
            <div className="flex items-center gap-2 pb-1">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]">
                <Upload size={14} /> {avatarUrl ? 'Change logo' : 'Upload logo'}
                <input type="file" accept="image/*" hidden onChange={handleAvatar} />
              </label>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  title="Remove logo"
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-400"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-[var(--text-muted)]">Optional — banner and logo appear on your public company profile.</p>
        </div>
      </div>

      {/* ---------- Text fields ---------- */}
      <div className="card space-y-5">
        <h2 className="text-lg font-semibold">Company Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Organization name</label><input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Nimbus Labs" required className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Industry</label><input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Cloud infrastructure & DevTools" className="input-field" /></div>
        </div>
        <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">About Us</label><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="What you do, culture, mission…" className="input-field" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, State, Country" className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Website</label><input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Contact email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hiring@company.com" className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Telephone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" className="input-field" /></div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary"><Save size={16} /> {saving ? 'Saving…' : 'Save Company Profile'}</button>
      </div>
    </form>
  );
}
