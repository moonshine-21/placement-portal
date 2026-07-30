import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { loadCompanies, loadMatches, generateAndSaveMatches } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { Target, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { Match } from '@/lib/supabase';

export function MatchesView() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const companies = await loadCompanies();
      let m = await loadMatches(profile.id);
      if (!m.length && companies.length > 0) {
        m = await generateAndSaveMatches(profile, companies);
      }
      setMatches(m);
      setLoading(false);
    })();
  }, [profile]);

  const applyToCompany = async (companyId: string, companyName: string) => {
    if (!profile) return;
    setApplying(companyId);
    const { error } = await supabase.from('applications').upsert(
      { student_id: profile.id, company_id: companyId, status: 'applied' },
      { onConflict: 'student_id,company_id' }
    );
    setApplying(null);
    if (error) {
      showToast('Could not apply: ' + error.message, 'error');
    } else {
      showToast(`Applied to ${companyName}!`, 'success');
    }
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
        <p className="text-sm text-[var(--text-muted)] max-w-sm">Add your skills and CGPA in the Profile page to get matched with companies.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your Matches & Recommendations</h2>
        <span className="text-sm text-[var(--text-muted)]">{matches.length} companies</span>
      </div>

      <div className="space-y-3">
        {matches.map((m, i) => {
          const c = m.companies;
          if (!c) return null;
          const isHigh = m.match_score >= 85;
          const isEligible = m.eligible;
          return (
            <div
              key={m.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--border-strong)] animate-fade-in"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white flex-shrink-0" style={{ background: c.logo_color }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[var(--text-primary)]">{c.name}</h3>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isHigh ? 'bg-emerald-500/15 text-emerald-400' : m.match_score >= 60 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {m.match_score}% match
                      </span>
                      {isEligible ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 size={10} /> Eligible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                          <AlertTriangle size={10} /> Not eligible
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">{c.role} · {c.package_lpa} LPA</p>
                    {m.missing_skills.length > 0 && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        <span className="font-medium">Missing skills:</span> {m.missing_skills.join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-1">{m.reasoning}</p>
                  </div>
                </div>
                <button
                  onClick={() => applyToCompany(c.id, c.name)}
                  disabled={applying === c.id}
                  className="btn-primary btn-sm flex-shrink-0"
                >
                  <Send size={14} /> {applying === c.id ? 'Applying…' : 'Apply'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
