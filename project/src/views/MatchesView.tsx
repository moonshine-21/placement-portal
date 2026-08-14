import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { loadOpenJobs, generateJobMatches } from '@/lib/data';
import { Target, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { JobMatch } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
  onApplyToCompany: (companyId: string) => void;
};

export function MatchesView({ onNavigate, onApplyToCompany }: Props) {
  const { profile } = useAuth();
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const jobs = await loadOpenJobs();
      setMatches(generateJobMatches(profile, jobs));
      setLoading(false);
    })();
  }, [profile]);

  const apply = (m: JobMatch) => {
    onApplyToCompany(m.company_id);
    onNavigate('companies');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center">
        <Target size={40} className="text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold">No matches yet</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-sm">Add your skills and CGPA in the Profile page to get matched with companies. If there aren't any open job postings yet, check back once companies start hiring.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your Matches & Recommendations</h2>
        <span className="text-sm text-[var(--text-muted)]">{matches.length} open roles</span>
      </div>

      <div className="space-y-3">
        {matches.map((m, i) => {
          const isHigh = m.match_score >= 85;
          return (
            <div
              key={m.job_id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--border-strong)] animate-fade-in"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {m.company_avatar_url ? (
                    <img src={m.company_avatar_url} alt="" className="h-11 w-11 flex-shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white flex-shrink-0 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                      {m.company_name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[var(--text-primary)]">{m.company_name}</h3>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isHigh ? 'bg-emerald-500/15 text-emerald-400' : m.match_score >= 60 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {m.match_score}% match
                      </span>
                      {m.eligible ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 size={10} /> Strong fit
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                          <AlertTriangle size={10} /> Skill gap
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">{m.job_name}{m.role ? ` — ${m.role}` : ''}{m.package_lpa ? ` · ${m.package_lpa} LPA` : ''}</p>
                    {m.missing_skills.length > 0 && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        <span className="font-medium">Missing skills:</span> {m.missing_skills.join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-1">{m.reasoning}</p>
                  </div>
                </div>
                <button
                  onClick={() => apply(m)}
                  className="btn-primary btn-sm flex-shrink-0"
                >
                  <Send size={14} /> View & Apply
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
