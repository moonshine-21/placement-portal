// ============================================================================
// src/views/MatchesView.tsx
//
// WHAT THIS FILE IS: the "AI Matching" page — shows the result of scoring
// the signed-in student against every currently OPEN job posting from a
// real company (including AI/"bot" companies), sorted best-match-first,
// with a match percentage, missing skills, and a button that sends the
// student to the real Companies page to actually apply.
//
// This used to match against a separate, now-empty `companies` table —
// see loadLiveMatches() in src/lib/data.ts for why it was switched to the
// real company_profiles/jobs system instead.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { loadLiveMatches, type LiveMatch } from '@/lib/data';
import { Target, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { CompanyProfile, Job } from '@/lib/supabase';

type Props = {
  // Takes the student straight to THIS company's profile with THIS job's
  // Apply flow already open, instead of just switching to the general
  // Companies tab and leaving them to find it themselves.
  onViewCompany: (company: CompanyProfile, job: Job) => void;
};

// company_profiles has no stored "logo_color" the way the old companies
// table did — this derives a stable, consistent color per company from
// its name instead, so the same company always gets the same color
// (rather than a random one on every render).
const LOGO_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length];
}

export function MatchesView({ onViewCompany }: Props) {
  const { profile } = useAuth();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const m = await loadLiveMatches(profile);
      setMatches(m);
      setLoading(false);
    })();
  }, [profile]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
    );
  }

  if (matches.length === 0) {
    const hasSkills = !!profile?.skills && profile.skills.length > 0;
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center">
        <Target size={40} className="text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold">{hasSkills ? "Sorry, no matches right now" : 'No matches yet'}</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-sm">
          {hasSkills
            ? "You don't match any companies with these skills right now — check back once more roles are posted."
            : 'Add your skills in the Profile page to get matched with open roles.'}
        </p>
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
          const c = m.company;
          const j = m.job;
          const isHigh = m.match_score >= 85;
          return (
            <div
              key={m.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--border-strong)] animate-fade-in"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold text-white aspect-square"
                    style={{ background: colorFor(c.org_name || 'CO') }}
                  >
                    {(c.org_name || 'CO').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[var(--text-primary)]">{c.org_name}</h3>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isHigh ? 'bg-emerald-500/15 text-emerald-400' : m.match_score >= 60 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {m.match_score}% match
                      </span>
                      {m.missing_skills.length === 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 size={10} /> All skills met
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">{j.job_name} · {j.package_lpa} LPA</p>
                    {m.missing_skills.length > 0 && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        <span className="font-medium">Missing skills:</span> {m.missing_skills.join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-1">{m.reasoning}</p>
                  </div>
                </div>
                <button onClick={() => onViewCompany(c, j)} className="btn-primary btn-sm flex-shrink-0">
                  View & Apply <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
