// ============================================================================
// src/views/CompaniesBrowseView.tsx
//
// WHAT THIS FILE IS: the student-facing "browse companies" page — three
// screens combined into one file, since they form a single natural flow:
//   1. CompaniesBrowseView  — the grid of every company, with search + bookmark
//   2. CompanyPublicView    — a single company's public profile + open jobs
//   3. ApplyModal           — the actual application form (resume upload, etc)
//
// This is the REAL, modern application system (as opposed to the older
// `companies`/`applications`/`Match` system used by MatchesView.tsx) — it
// applies to a real CompanyProfile's specific job postings, and works
// identically whether that company is run by a human or is an AI "bot"
// (see the is_bot check near the bottom of ApplyModal's submit function).
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { uploadPrivateFile, openPrivateFile } from '@/lib/data';
import { Building2, ArrowLeft, Globe, Mail, Phone, MapPin, Briefcase, Send, X, Bookmark, BookmarkCheck, Search } from 'lucide-react';
import type { CompanyProfile, Job } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
  // Set by App.tsx (e.g. from MatchesView's "View & Apply" button) to
  // jump straight to one company's profile — with that specific job's
  // Apply form already open — instead of landing on the grid and making
  // the student find it themselves. `onConsumedPendingCompany` clears it
  // so it doesn't keep re-triggering on every re-render.
  pendingCompany?: { company: CompanyProfile; job: Job } | null;
  onConsumedPendingCompany?: () => void;
};

export function CompaniesBrowseView({ onNavigate, pendingCompany, onConsumedPendingCompany }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  // Which company (if any) has been clicked into — when set, this whole
  // component switches to showing CompanyPublicView instead of the grid
  // (see the `if (selected) return ...` check below).
  const [selected, setSelected] = useState<CompanyProfile | null>(null);
  // The specific job to have CompanyPublicView open its Apply form for
  // immediately, when arriving here via pendingCompany rather than by
  // clicking through the grid normally.
  const [initialJob, setInitialJob] = useState<Job | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      // `.not('org_name', 'eq', '')` filters out any company_profiles row
      // with a blank org_name — this hides "shell" accounts that were
      // created (e.g. via signup) but never actually filled out their
      // company profile yet, so half-empty listings don't clutter the browse page.
      const { data } = await supabase.from('company_profiles').select('*').not('org_name', 'eq', '').order('updated_at', { ascending: false });
      setCompanies((data as CompanyProfile[]) || []);
      setLoading(false);
    })();
  }, []);

  // Consume a pending "open this company + job" request the moment it
  // arrives (e.g. from Matches). Runs on every change to pendingCompany
  // so clicking a second "View & Apply" while already on this tab also
  // works, not just the very first time this view mounts.
  useEffect(() => {
    if (pendingCompany) {
      setSelected(pendingCompany.company);
      setInitialJob(pendingCompany.job);
      onConsumedPendingCompany?.();
    }
  }, [pendingCompany]);

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}</div>;

  // Adds or removes a bookmark. `e.stopPropagation()` is essential here —
  // the bookmark button sits ON TOP of the whole card, which itself is
  // clickable to open the company's profile; without stopping
  // propagation, clicking the bookmark icon would ALSO trigger opening
  // the company (since the click "bubbles up" to the card underneath).
  const toggleBookmark = async (e: React.MouseEvent, companyId: string) => {
    e.stopPropagation();
    if (!profile) return;
    if (bookmarkedIds.has(companyId)) {
      await supabase.from('bookmarks').delete().eq('student_id', profile.id).eq('company_id', companyId);
      // Build a new Set with this ID removed — same "never mutate state
      // directly, always build a new copy" rule used throughout this app.
      setBookmarkedIds(prev => { const next = new Set(prev); next.delete(companyId); return next; });
      showToast('Bookmark removed', 'info');
    } else {
      await supabase.from('bookmarks').insert({ student_id: profile.id, company_id: companyId });
      setBookmarkedIds(prev => new Set(prev).add(companyId));
      showToast('Company bookmarked!', 'success');
    }
  };

  // If a company has been selected, render its full public profile
  // INSTEAD of the grid — this early `return` is what makes this one
  // component behave like two different "pages."
  if (selected) {
    return (
      <CompanyPublicView
        company={selected}
        onBack={() => { setSelected(null); setInitialJob(null); }}
        onNavigate={onNavigate}
        bookmarked={bookmarkedIds.has(selected.id)}
        onToggleBookmark={toggleBookmark}
        initialJob={initialJob}
      />
    );
  }

  // Simple client-side search — filters the already-loaded list in the
  // browser rather than re-querying the database on every keystroke,
  // since the full company list is small enough to just keep in memory.
  const q = search.trim().toLowerCase();
  const filtered = q
    ? companies.filter((c) =>
        (c.org_name || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.about_us || '').toLowerCase().includes(q)
      )
    : companies;

  return (
    <div className="card">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Companies Hiring</h2>
          <span className="text-sm text-[var(--text-muted)]">{filtered.length}{q ? ` of ${companies.length}` : ''} companies</span>
        </div>
        <div className="search-field-wrap w-full sm:w-72">
          <Search size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="search-field"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Building2 size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">{q ? 'No companies match your search.' : 'No company profiles yet.'}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className="card card-hover relative animate-fade-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {/* The entire card body is one big button that opens the
                  company's profile — the bookmark icon is a SEPARATE
                  button layered on top (`absolute` positioned), not
                  nested inside this one, since a button can't legally
                  contain another button in HTML. */}
              <button onClick={() => setSelected(c)} className="block w-full text-left">
                <div className="flex items-start gap-3">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-12 w-12 rounded-xl object-cover object-top" /> : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-sm font-bold text-white">{(c.org_name || 'CO').slice(0, 2).toUpperCase()}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{c.org_name}</h3>
                    <p className="text-xs text-[var(--text-muted)] truncate">{c.industry || '—'}</p>
                  </div>
                </div>
                {c.about_us && <p className="mt-3 text-xs text-[var(--text-secondary)] line-clamp-2">{c.about_us}</p>}
                {c.website && <p className="mt-2 text-xs text-[var(--accent)] truncate">{c.website}</p>}
              </button>
              <button onClick={(e) => toggleBookmark(e, c.id)} className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:scale-110" style={{ color: bookmarkedIds.has(c.id) ? 'var(--accent)' : 'var(--text-muted)' }}>
                {bookmarkedIds.has(c.id) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The single-company detail page — shown when a card above is clicked.
// Kept in this same file (rather than its own separate file) since it's
// tightly coupled to CompaniesBrowseView and never used anywhere else.
function CompanyPublicView({ company, onBack, onNavigate, bookmarked, onToggleBookmark, initialJob }: { company: CompanyProfile; onBack: () => void; onNavigate: (v: string) => void; bookmarked: boolean; onToggleBookmark: (e: React.MouseEvent, companyId: string) => void; initialJob?: Job | null }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  // Controls the ApplyModal below: `null` = closed, a real Job = applying
  // to that SPECIFIC job, or the literal string `'general'` = applying to
  // the company directly without picking a specific posting. Seeded from
  // `initialJob` when arriving here via "View & Apply" on the Matches
  // page, so the form is already open instead of making the student find
  // and click Apply again on a job they already picked.
  const [showApply, setShowApply] = useState<Job | null | 'general'>(initialJob || null);

  useEffect(() => {
    // Only this company's currently OPEN jobs are shown — closed
    // postings don't clutter this page.
    supabase.from('jobs').select('*').eq('company_id', company.id).eq('status', 'open').order('created_at', { ascending: false }).then(({ data }) => setJobs((data as Job[]) || []));
  }, [company.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-ghost btn-sm"><ArrowLeft size={14} /> Back to Companies</button>
        <button onClick={(e) => onToggleBookmark(e, company.id)} className={`btn-ghost btn-sm ${bookmarked ? 'text-[var(--accent)]' : ''}`}>
          {bookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} {bookmarked ? 'Bookmarked' : 'Bookmark'}
        </button>
      </div>

      {/* Banner + logo header, same visual pattern as
          CompanyProfileCardModal.tsx, just as a full page instead of a popup. */}
      <div className="card overflow-hidden">
        <div className="relative h-32 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-2)]/20 overflow-hidden">
          {company.banner_url && <img src={company.banner_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="px-6 pb-6">
          {/* `relative z-10`: the banner div above is `position: relative`
              (a positioned element), which per the CSS stacking spec
              always paints above non-positioned in-flow siblings
              regardless of DOM order — without this, the logo (in the
              `-mt-10` div below, not positioned) was losing to the
              banner and appearing to sit underneath it. */}
          <div className="-mt-10 mb-3 inline-block relative z-10">
            {company.avatar_url ? <img src={company.avatar_url} alt="" className="h-20 w-20 rounded-2xl border-4 border-[var(--bg-elevated)] object-cover object-top" /> : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-[var(--bg-elevated)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-lg font-bold text-white">{(company.org_name || 'CO').slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <h2 className="text-xl font-bold">{company.org_name}</h2>
          <p className="text-sm text-[var(--text-muted)]">{company.industry}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">About Us</h3>
        <p className="text-sm text-[var(--text-secondary)]">{company.about_us || 'No description available.'}</p>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-4">Open Jobs</h3>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center"><Briefcase size="24" className="text-[var(--text-muted)]" /><p className="text-sm text-[var(--text-muted)]">No jobs posted yet.</p></div>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h4 className="font-medium">{j.job_name}</h4><p className="text-xs text-[var(--text-muted)]">{j.role} · {j.package_lpa} LPA</p></div>
                  {/* Clicking Apply on a SPECIFIC job passes that job
                      object into showApply, so ApplyModal knows exactly
                      which posting this application is for. */}
                  <button onClick={() => setShowApply(j)} className="btn-primary btn-sm"><Send size={12} /> Apply</button>
                </div>
                {j.description && <p className="text-xs text-[var(--text-secondary)] mt-2">{j.description}</p>}
                {j.skills_required.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{j.skills_required.map((s) => <span key={s} className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">{s}</span>)}</div>}
              </div>
            ))}
          </div>
        )}
        {/* A general "apply without a specific job" option, always
            available even if the company has zero open postings listed. */}
        <button onClick={() => setShowApply('general')} className="btn-ghost btn-sm mt-4 w-full"><Send size={14} /> Apply to {company.org_name} directly</button>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Contact</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {company.address && <div className="flex items-center gap-2 text-sm"><MapPin size={16} className="text-[var(--accent)]" /><span className="text-[var(--text-secondary)]">{company.address}</span></div>}
          {company.contact_email && <div className="flex items-center gap-2 text-sm"><Mail size={16} className="text-[var(--accent)]" /><span className="text-[var(--text-secondary)]">{company.contact_email}</span></div>}
          {company.contact_phone && <div className="flex items-center gap-2 text-sm"><Phone size={16} className="text-[var(--accent)]" /><span className="text-[var(--text-secondary)]">{company.contact_phone}</span></div>}
          {company.website && <div className="flex items-center gap-2 text-sm"><Globe size={16} className="text-[var(--accent)]" /><a href={company.website} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">{company.website}</a></div>}
        </div>
      </div>

      {showApply && (
        <ApplyModal
          company={company}
          job={showApply === 'general' ? null : showApply}
          onClose={() => setShowApply(null)}
          onApplied={() => { setShowApply(null); onNavigate('applications'); }}
        />
      )}
    </div>
  );
}

// The actual application form popup.
function ApplyModal({ company, job, onClose, onApplied }: { company: CompanyProfile; job: Job | null; onClose: () => void; onApplied: () => void }) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  // Pre-fill name/email from the student's existing profile, so they
  // don't have to retype what we already know — but still let them edit
  // it for this specific application (e.g. a different contact email).
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(profile?.email || '');
  const [comment, setComment] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeFile || !user) { showToast('Please attach your resume', 'error'); return; }
    setSubmitting(true);

    // Step 1: upload the resume to PRIVATE storage — it needs a real
    // student to be logged in to view it later (see openPrivateFile in
    // src/lib/data.ts), so nobody can grab an applicant's resume from a
    // public link.
    const resumePath = await uploadPrivateFile('resumes', resumeFile, user.id);
    if (!resumePath) { showToast('Resume upload failed', 'error'); setSubmitting(false); return; }

    // Step 2: also save the (possibly edited) name back onto the
    // student's own main profile, so it stays in sync going forward.
    await supabase.from('profiles').upsert({ id: user.id, email: user.email, full_name: fullName }, { onConflict: 'id' });

    // Step 3: create the actual application row.
    const { data, error } = await supabase.from('company_applications').insert({
      company_id: company.id, student_id: user.id, full_name: fullName, address, phone, email,
      resume_url: resumePath, resume_filename: resumeFile.name, comment, status: 'pending', job_id: job?.id || null,
    }).select().maybeSingle();

    if (error) { showToast('Could not submit application: ' + error.message, 'error'); setSubmitting(false); return; }

    // Step 4: notify the company that a new application has arrived.
    await supabase.from('notifications').insert({
      user_id: company.id, type: 'application',
      title: `New application from ${fullName}`,
      body: `Applied for ${job?.job_name || 'a role'} at ${company.org_name}`,
      link_view: 'applicants', link_id: (data as any)?.id,
    });

    showToast('Application submitted!', 'success');
    setSubmitting(false);

    // Step 5 (bot companies only): if this company is AI-run, trigger the
    // server to actually evaluate this application — see
    // api/bot-evaluate-application.ts. This runs "fire and forget"
    // (we don't `await` it or block the UI on it) — its result (shortlist/
    // reject, a DM, maybe a quiz) will simply show up in the
    // Applications/Messages views on its own within a few seconds.
    if (company.is_bot && (data as any)?.id) {
      supabase.auth.getSession().then(({ data: sessionData }) => {
        const token = sessionData.session?.access_token;
        if (!token) return;
        fetch('/api/bot-evaluate-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ applicationId: (data as any).id }),
        }).catch(() => { /* best-effort */ });
      });
    }

    onApplied();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <form onSubmit={submit} className="glass w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto scroll-thin animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Apply to {company.org_name}{job ? ` — ${job.job_name}` : ''}</h3>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
        </div>
        {job && <div className="mb-4 rounded-lg bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)]">{job.role} · {job.package_lpa} LPA</div>}
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Full Name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="input-field" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} required className="input-field" /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-field" /></div>
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} className="input-field" /></div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Resume (PDF or image — required)</label>
            {/* Styled file-upload box, same "invisible input wrapped in a
                clickable label" pattern used in ProjectsView.tsx. */}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] p-4 transition-all hover:border-[var(--accent)]">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setResumeFile(f); }} />
              <span className="text-sm text-[var(--text-secondary)]">{resumeFile ? resumeFile.name : 'Click to choose file'}</span>
            </label>
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Comment (optional)</label><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="input-field" /></div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? 'Submitting…' : 'Submit Application'}</button>
        </div>
      </form>
    </div>
  );
}
