import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { uploadPrivateFile, openPrivateFile } from '@/lib/data';
import { Building2, ArrowLeft, Globe, Mail, Phone, MapPin, Briefcase, Send, X, Bookmark, BookmarkCheck, Search } from 'lucide-react';
import type { CompanyProfile, Job } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
};

export function CompaniesBrowseView({ onNavigate }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CompanyProfile | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('company_profiles').select('*').not('org_name', 'eq', '').order('updated_at', { ascending: false });
      setCompanies((data as CompanyProfile[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}</div>;

  const toggleBookmark = async (e: React.MouseEvent, companyId: string) => {
    e.stopPropagation();
    if (!profile) return;
    if (bookmarkedIds.has(companyId)) {
      await supabase.from('bookmarks').delete().eq('student_id', profile.id).eq('company_id', companyId);
      setBookmarkedIds(prev => { const next = new Set(prev); next.delete(companyId); return next; });
      showToast('Bookmark removed', 'info');
    } else {
      await supabase.from('bookmarks').insert({ student_id: profile.id, company_id: companyId });
      setBookmarkedIds(prev => new Set(prev).add(companyId));
      showToast('Company bookmarked!', 'success');
    }
  };

  if (selected) {
    return <CompanyPublicView company={selected} onBack={() => setSelected(null)} onNavigate={onNavigate} bookmarked={bookmarkedIds.has(selected.id)} onToggleBookmark={toggleBookmark} />;
  }

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
        <div className="relative w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="input-field pl-10 py-2 text-sm"
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
              <button onClick={() => setSelected(c)} className="block w-full text-left">
                <div className="flex items-start gap-3">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-12 w-12 rounded-xl object-cover" /> : (
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

function CompanyPublicView({ company, onBack, onNavigate, bookmarked, onToggleBookmark }: { company: CompanyProfile; onBack: () => void; onNavigate: (v: string) => void; bookmarked: boolean; onToggleBookmark: (e: React.MouseEvent, companyId: string) => void }) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showApply, setShowApply] = useState<Job | null | 'general'>(null);

  useEffect(() => {
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

      <div className="card overflow-hidden">
        <div className="relative h-32 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-2)]/20 overflow-hidden">
          {company.banner_url && <img src={company.banner_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="px-6 pb-6">
          <div className="-mt-10 mb-3 inline-block">
            {company.avatar_url ? <img src={company.avatar_url} alt="" className="h-20 w-20 rounded-2xl border-4 border-[var(--bg-elevated)] object-cover" /> : (
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
                  <button onClick={() => setShowApply(j)} className="btn-primary btn-sm"><Send size={12} /> Apply</button>
                </div>
                {j.description && <p className="text-xs text-[var(--text-secondary)] mt-2">{j.description}</p>}
                {j.skills_required.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{j.skills_required.map((s) => <span key={s} className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">{s}</span>)}</div>}
              </div>
            ))}
          </div>
        )}
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

function ApplyModal({ company, job, onClose, onApplied }: { company: CompanyProfile; job: Job | null; onClose: () => void; onApplied: () => void }) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
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
    const resumePath = await uploadPrivateFile('resumes', resumeFile, user.id);
    if (!resumePath) { showToast('Resume upload failed', 'error'); setSubmitting(false); return; }

    await supabase.from('profiles').upsert({ id: user.id, email: user.email, full_name: fullName }, { onConflict: 'id' });

    const { data, error } = await supabase.from('company_applications').insert({
      company_id: company.id, student_id: user.id, full_name: fullName, address, phone, email,
      resume_url: resumePath, resume_filename: resumeFile.name, comment, status: 'pending', job_id: job?.id || null,
    }).select().maybeSingle();

    if (error) { showToast('Could not submit application: ' + error.message, 'error'); setSubmitting(false); return; }

    await supabase.from('notifications').insert({
      user_id: company.id, type: 'application',
      title: `New application from ${fullName}`,
      body: `Applied for ${job?.job_name || 'a role'} at ${company.org_name}`,
      link_view: 'applicants', link_id: (data as any)?.id,
    });

    showToast('Application submitted!', 'success');
    setSubmitting(false);
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
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Resume (PDF or image — required)</label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] p-4 transition-all hover:border-[var(--accent)]"><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setResumeFile(f); }} /><span className="text-sm text-[var(--text-secondary)]">{resumeFile ? resumeFile.name : 'Click to choose file'}</span></label></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Comment (optional)</label><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="input-field" /></div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? 'Submitting…' : 'Submit Application'}</button>
        </div>
      </form>
    </div>
  );
}
