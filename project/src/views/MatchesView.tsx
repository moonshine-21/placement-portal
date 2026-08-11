// ============================================================================
// src/views/MatchesView.tsx
//
// WHAT THIS FILE IS: the "AI Matching" page — shows every result of
// running the matching algorithm (see src/lib/data.ts's computeMatch)
// against the older/separate `companies` table, sorted best-match-first,
// with a match percentage, eligibility check, missing skills, and an
// Apply button for each.
//
// Note this is a DIFFERENT, older application system from the real
// company/job application flow in CompaniesBrowseView.tsx — this one
// applies to the static `companies` table entries via the plain
// `applications` table, not to a real company's specific job postings.
// ============================================================================

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
  const [applying, setApplying] = useState<string | null>(null); // which company's Apply button is currently mid-click (shows "Applying…" on just that one button)

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const companies = await loadCompanies();
      // Try to load ALREADY-CALCULATED matches first (fast — no math
      // needed) — only run the actual matching algorithm from scratch if
      // none exist yet (e.g. this is the student's very first visit to
      // this page). This avoids needlessly recalculating scores every
      // single time the page is opened.
      let m = await loadMatches(profile.id);
      if (!m.length && companies.length > 0) {
        m = await generateAndSaveMatches(profile, companies);
      }
      setMatches(m);
      setLoading(false);
    })();
  }, [profile]);

  // Applies to one of the older-style `Company` entries.
  const applyToCompany = async (companyId: string, companyName: string) => {
    if (!profile) return;
    setApplying(companyId);
    // `.upsert(...)` here means "create the application, or if one
    // already exists for this exact student+company pair, just leave it
    // as-is" — this makes clicking Apply twice on the same company safe
    // (it won't create a duplicate application).
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
          // Defensive check — if the joined company data is missing for
          // some reason, skip rendering this row rather than crashing.
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
                  {/* Each older-style Company entry has its own stored
                      `logo_color` (see the Company type in supabase.ts) —
                      used here to give each one a distinct, consistent
                      logo-placeholder color rather than every company
                      looking identical. */}
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white flex-shrink-0" style={{ background: c.logo_color }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[var(--text-primary)]">{c.name}</h3>
                      {/* The match-score badge's color scales with the
                          score itself: green for a strong match, amber
                          for a moderate one, red for weak. */}
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isHigh ? 'bg-emerald-500/15 text-emerald-400' : m.match_score >= 60 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {m.match_score}% match
                      </span>
                      {/* Eligibility is shown as a SEPARATE badge from the
                          match score, since (as explained in computeMatch)
                          they can disagree — a high score doesn't
                          guarantee meeting the hard CGPA/branch bar. */}
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
