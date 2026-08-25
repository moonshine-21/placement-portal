// ============================================================================
// src/views/ApplicationsView.tsx
//
// WHAT THIS FILE IS: a student's unified "Applications" tracker — this app
// actually has TWO separate application systems under the hood (the older
// `applications` table, tied to the static `companies` matching list; and
// the newer `company_applications` table, tied to real company accounts
// and specific job postings — see the type comments in src/lib/supabase.ts
// for the full explanation). This page fetches BOTH, merges them into one
// combined list, and displays them together as if they were one system —
// so from the student's point of view, there's just one simple
// "Applications" page, regardless of which system each entry actually
// came from.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { RefreshCw, FileText, Building2 } from 'lucide-react';
import type { Application, Company, CompanyApplication } from '@/lib/supabase';

// The single, unified shape both kinds of application get converted into,
// so the table below can render them identically without caring which
// system each one came from. `source` remembers which original table it
// was, purely so the React `key` below (`${source}-${id}`) can stay
// unique even if an old-system ID and a new-system ID happened to collide.
type TrackedApp = {
  id: string;
  source: 'match' | 'company';
  companyName: string;
  role: string;
  packageLabel: string;
  status: string;
  appliedAt: string;
  logoColor?: string; // only ever set for 'match'-source entries, which have a stored color; 'company'-source entries fall back to a generic icon
  comment?: string;
};

export function ApplicationsView() {
  const { profile, user } = useAuth();
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [loading, setLoading] = useState(true);

  const loadApps = async () => {
    if (!profile || !user) return;
    // Do not force skeleton after first load — prevents blink on auth refresh


    // Fetch all THREE things needed, in parallel: the old-system
    // applications (joined with their Company details), the new-system
    // applications, and every real company's basic profile info (needed
    // to look up a company's NAME for the new-system entries, since those
    // rows only store a bare company_id, not the name itself).
    const [
      { data: matchApps, error: matchErr },
      { data: companyApps, error: companyErr },
      { data: companyProfs, error: profsErr },
    ] = await Promise.all([
      supabase
        .from('applications')
        .select('*, companies(*)')
        .eq('student_id', profile.id)
        .order('applied_at', { ascending: false }),
      supabase
        .from('company_applications')
        .select('*')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('company_profiles').select('id, org_name, avatar_url'),
    ]);

    // Log any failures with a hint about WHY they might have failed
    // (e.g. a migration not being applied yet) — helpful for debugging
    // during development, without blocking the rest of the page from
    // still showing whatever data DID load successfully.
    if (matchErr) console.error('loadApps: failed to load matched applications:', matchErr);
    if (companyErr) console.error('loadApps: failed to load company applications (is the "company_applications" migration applied?):', companyErr);
    if (profsErr) console.error('loadApps: failed to load company profiles (is the "company_profiles" migration applied?):', profsErr);

    // Build a quick company_id → org_name lookup table, used just below.
    const orgMap = new Map<string, string>();
    (companyProfs || []).forEach((c: { id: string; org_name: string }) => {
      orgMap.set(c.id, c.org_name || 'Company');
    });

    const tracked: TrackedApp[] = [];

    // Convert every old-system application into the shared TrackedApp shape.
    ((matchApps as (Application & { companies?: Company })[]) || []).forEach((a) => {
      const c = a.companies;
      tracked.push({
        id: a.id,
        source: 'match',
        companyName: c?.name || 'Company',
        role: c?.role || '—',
        packageLabel: c?.package_lpa != null ? `${c.package_lpa} LPA` : '—',
        status: a.status || 'applied',
        appliedAt: a.applied_at,
        logoColor: c?.logo_color,
      });
    });

    // Convert every new-system application into the same shared shape.
    ((companyApps as CompanyApplication[]) || []).forEach((a) => {
      tracked.push({
        id: a.id,
        source: 'company',
        companyName: orgMap.get(a.company_id) || 'Company',
        role: a.job_id ? 'Job application' : 'Direct application',
        packageLabel: '—', // the new system's applications don't carry package info directly on this row
        status: a.status || 'pending',
        appliedAt: a.created_at,
        comment: a.comment,
      });
    });

    // Now that both lists are merged into one, re-sort the COMBINED list
    // by date, newest first — otherwise it would just be "all old-system
    // apps, then all new-system apps" rather than truly interleaved by
    // when each one actually happened.
    tracked.sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
    setApps(tracked);
    setLoading(false);
  };

  useEffect(() => {
    loadApps();
    if (!user) return;

    // Live updates: watch BOTH underlying tables for ANY change
    // (`event: '*'` covers insert/update/delete) to this student's own
    // rows, so a company changing someone's status updates this page
    // immediately without needing a manual refresh.
    const ch1 = supabase
      .channel(`apps-match-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications', filter: `student_id=eq.${user.id}` },
        () => loadApps()
      )
      .subscribe();

    const ch2 = supabase
      .channel(`apps-company-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_applications', filter: `student_id=eq.${user.id}` },
        () => loadApps()
      )
      .subscribe();

    // A backup safety net: also just re-fetch everything every 8 seconds
    // regardless, in case realtime updates aren't enabled/working for
    // some reason (e.g. a Supabase project where realtime wasn't turned
    // on for these tables) — this way status changes still eventually
    // show up even without relying purely on the live subscription above.
    const poll = setInterval(loadApps, 8000);

    return () => {
      try { supabase.removeChannel(ch1); } catch { /* */ }
      try { supabase.removeChannel(ch2); } catch { /* */ }
      clearInterval(poll);
    };
  }, [profile?.id, user?.id]);

  // Colors for every possible status across BOTH systems combined (some
  // status names only exist in one system or the other, but they're all
  // handled here in one shared lookup table).
  const statusColors: Record<string, string> = {
    applied: 'bg-sky-500/15 text-sky-400',
    submitted: 'bg-sky-500/15 text-sky-400',
    pending: 'bg-amber-500/15 text-amber-400',
    viewed: 'bg-indigo-500/15 text-indigo-400',
    shortlisted: 'bg-emerald-500/15 text-emerald-400',
    rejected: 'bg-rose-500/15 text-rose-400',
    hired: 'bg-purple-500/15 text-purple-400',
  };

  // Only show the full-page skeleton on the very FIRST load (`apps.length
  // === 0`) — the background 8-second poll set up above also sets
  // `loading` true/false each time, but we don't want the whole table to
  // flash back to a skeleton every 8 seconds once real data is already showing.
  if (loading && apps.length === 0) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>;
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your Applications</h2>
          <p className="text-xs text-[var(--text-muted)]">Status updates live when a company reviews you</p>
        </div>
        <button onClick={loadApps} className="btn-ghost btn-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {apps.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">You haven't applied to any companies yet.</p>
          <p className="text-xs text-[var(--text-muted)]">Apply from Matches or the Companies tab.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                <th className="pb-3 font-medium">Company</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Package</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                // `${a.source}-${a.id}` as the key, since an old-system ID
                // and a new-system ID are entirely separate UUID
                // sequences that could theoretically ever collide.
                <tr key={`${a.source}-${a.id}`} className="border-b border-[var(--border)] last:border-0 animate-fade-in">
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      {/* Old-system entries have a real stored logo
                          color, shown with the company's initials on top;
                          new-system entries fall back to a generic
                          gradient with a building icon, since real
                          company accounts don't have a "logo color" field
                          (they'd have a real uploaded logo image instead,
                          which this compact table row doesn't have room
                          to show). */}
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white flex-shrink-0"
                        style={{ background: a.logoColor || 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
                      >
                        {a.logoColor ? a.companyName.slice(0, 2).toUpperCase() : <Building2 size={14} />}
                      </div>
                      <span className="font-medium">{a.companyName}</span>
                    </div>
                  </td>
                  <td className="py-3 text-[var(--text-secondary)]">{a.role}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{a.packageLabel}</td>
                  <td className="py-3">
                    <span className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${statusColors[a.status] || 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-[var(--text-muted)]">{new Date(a.appliedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
