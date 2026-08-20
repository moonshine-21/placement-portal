// ============================================================================
// src/views/DashboardView.tsx
//
// WHAT THIS FILE IS: the student's home/landing page after logging in —
// stat cards, a table of top company matches (filterable by score
// range), an AI recommendation blurb, a profile-completion checklist,
// two decorative charts, and a preview of the latest announcements/events.
//
// Note: the "Placement Trend" and "Role Demand" charts near the bottom
// use HARDCODED sample numbers (`trendData` and the `[85, 72, 64, 58, 45]`
// array) — they're honestly just illustrative decoration, not
// calculated from real data, since this app doesn't track historical
// placement trends or live role-demand statistics. Worth knowing if
// asked about them in a presentation.
// ============================================================================

import { useEffect, useState } from 'react';
import { TrendingUp, Target, Building2, Award, CheckCircle2, Circle, ArrowRight, Calendar, Megaphone, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { loadLiveMatches, calculateProfileCompletion, type LiveMatch } from '@/lib/data';
import type { Announcement, Event } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
};

// Same deterministic name → color helper used in MatchesView.tsx —
// company_profiles has no stored logo_color the way the old companies
// table did.
const LOGO_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length];
}

export function DashboardView({ onNavigate }: Props) {
  const { profile } = useAuth();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [applicationCount, setApplicationCount] = useState(0); // count of real applications, from company_applications (see ApplicationsView.tsx)
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all'); // which match-score bucket the table below is currently showing
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const m = await loadLiveMatches(profile);
      setMatches(m);

      // Count of REAL applications (company_applications — the modern
      // system tied to actual company_profiles/jobs, same table
      // ApplicationsView.tsx uses).
      const { count } = await supabase
        .from('company_applications')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile.id);
      setApplicationCount(count || 0);

      // Preview data for the bottom two "at a glance" cards — just the 3
      // most recent of each, full lists live on their own dedicated pages.
      const { data: anns } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(3);
      setAnnouncements((anns as Announcement[]) || []);

      // `.gte('event_date', ...)` — only events happening from NOW onward
      // (skip anything that's already passed), soonest first.
      const { data: evts } = await supabase.from('events').select('*').gte('event_date', new Date().toISOString()).order('event_date', { ascending: true }).limit(3);
      setUpcomingEvents((evts as Event[]) || []);

      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  // ---------- Derived stats, calculated fresh on every render from the loaded matches ----------
  const avgScore = matches.length ? Math.round(matches.reduce((s, m) => s + m.match_score, 0) / matches.length) : 0;
  const highMatches = matches.filter((m) => m.match_score >= 85).length;
  const completion = calculateProfileCompletion(profile || {});
  // Filters the match list down to whichever score bucket the "all/high/
  // medium/low" toggle currently has selected.
  const filtered = matches.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'high') return m.match_score >= 85;
    if (filter === 'medium') return m.match_score >= 60 && m.match_score < 85;
    return m.match_score < 60;
  });

  // The profile-completion checklist — each item's `done` flag is
  // computed live from the actual profile data, so it always reflects
  // reality (rather than being a separately-tracked, easy-to-desync flag).
  const checklist = [
    { done: !!profile?.full_name, label: 'Add your full name' },
    { done: !!profile?.bio && profile.bio.length > 10, label: 'Write a bio' },
    { done: !!profile?.branch, label: 'Select your branch' },
    { done: !!profile?.cgpa && profile.cgpa > 0, label: 'Enter your CGPA' },
    { done: !!profile?.skills?.length, label: 'Add your skills' },
    { done: !!profile?.avatar_url, label: 'Upload an avatar' },
  ];

  // See the file-header note above — this is illustrative sample data
  // for the "Placement Trend" chart, not a real calculation.
  const trendData = [42, 55, 48, 62, 70, 65, 78, 82];

  return (
    <div className="space-y-6">
      {/* ---------- Stat cards ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ">
        <StatCard
          icon={Target}
          label="Match Score"
          value={`${avgScore}`}
          sub="avg score"
          trend={avgScore >= 75 ? 'up' : 'flat'}
          ring={avgScore}
        />
        <StatCard
          icon={Building2}
          label="Companies Matched"
          value={`${matches.length}`}
          sub="Active recruiters"
          trend={matches.length > 5 ? 'up' : 'flat'}
          bars
        />
        <StatCard
          icon={Award}
          label="High Matches"
          value={`${highMatches}`}
          sub="Companies where you score 85+"
          trend={highMatches > 0 ? 'up' : 'flat'}
          progress={matches.length ? (highMatches / matches.length) * 100 : 0}
        />
        <StatCard
          icon={TrendingUp}
          label="Applications"
          value={`${applicationCount}`}
          sub="Companies applied to"
          trend={applicationCount > 0 ? 'up' : 'flat'}
          progress={matches.length ? (applicationCount / matches.length) * 100 : 0}
        />
      </div>

      {/* ---------- Main grid: matches table + sidebar ---------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold">Matched Companies</h2>
            {/* The filter toggle buttons — `as const` on the array below
                tells TypeScript to treat it as these 4 EXACT string
                values (matching the `filter` state's type) rather than
                just "an array of strings." */}
            <div className="flex gap-1.5">
              {(['all', 'high', 'medium', 'low'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                    filter === f
                      ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Building2 size={32} className="text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">No companies in this range yet.</p>
              <button onClick={() => onNavigate('profile')} className="btn-ghost btn-sm">
                Complete your profile <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="pb-3 font-medium">Company</th>
                    <th className="pb-3 font-medium">Match</th>
                    <th className="pb-3 font-medium">Package</th>
                    <th className="pb-3 font-medium">Role</th>
                    {/* This column is hidden on small screens
                        (`hidden md:table-cell`) to avoid a cramped
                        horizontal-scroll table on mobile. */}
                    <th className="pb-3 font-medium hidden md:table-cell">Why it matches</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Only the top 8 filtered matches are shown here — this
                      is a dashboard PREVIEW, not the full list (that
                      lives on the dedicated Matches page, linked via the
                      "View" button on each row). */}
                  {filtered.slice(0, 8).map((m) => {
                    const c = m.company;
                    const j = m.job;
                    return (
                      <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: colorFor(c.org_name) }}>
                              {c.org_name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-[var(--text-primary)]">{c.org_name}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-12 rounded-full bg-[var(--border-strong)] overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${m.match_score}%` }} />
                            </div>
                            <span className={`text-xs font-bold ${m.match_score >= 85 ? 'text-emerald-400' : m.match_score >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {m.match_score}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-[var(--text-secondary)]">{j.package_lpa} LPA</td>
                        <td className="py-3 text-[var(--text-secondary)]">{j.job_name}</td>
                        <td className="py-3 text-xs text-[var(--text-muted)] hidden md:table-cell max-w-xs truncate">{m.reasoning}</td>
                        <td className="py-3">
                          <button onClick={() => onNavigate('matches')} className="btn-ghost btn-sm">
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- Sidebar: AI recommendation + profile completion ---------- */}
        <div className="space-y-6">
          {/* This "AI Recommendation" text is actually just simple
              if/else logic based on the match data already loaded
              (NOT a real AI/Gemini call) — see the ternary chain below.
              It picks whichever message best fits the student's current
              situation: a strong top match, a skill gap to close, a fully
              complete profile with no companies yet, or an incomplete
              profile. */}
          <div className="card relative overflow-hidden">
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[var(--accent)]/10 blur-2xl" />
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">AI</span>
              <h2 className="text-sm font-semibold">Recommendation</h2>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {matches.length > 0 && matches[0].match_score >= 85
                ? `You're a strong match for ${matches[0].company.org_name}. Apply now to maximize your chances!`
                : matches.length > 0
                ? `Focus on closing skill gaps in ${matches[0].missing_skills?.slice(0, 2).join(', ')} to boost your top match.`
                : completion >= 100
                ? 'Your profile is all set — recommendations will appear here as soon as companies are added to the portal.'
                : 'Complete your profile with skills and CGPA to get AI-powered recommendations.'}
            </p>
            <button
              onClick={() => onNavigate(matches.length > 0 ? 'matches' : completion >= 100 ? 'companies' : 'profile')}
              className="btn-primary btn-sm mt-4 w-full"
            >
              {matches.length > 0 ? 'View matches' : completion >= 100 ? 'Browse companies' : 'Complete profile'} <ArrowRight size={14} />
            </button>
          </div>

          {/* Profile Completion — a circular "donut" progress ring drawn
              with raw SVG (see the explanation of how this technique
              works below), plus the checklist of specific missing items. */}
          <div className="card">
            <h2 className="mb-4 text-sm font-semibold">Profile Completion</h2>
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 flex-shrink-0">
                {/* How a "donut" progress ring works in SVG: draw a plain
                    gray circle as the background track, then draw a
                    SECOND circle exactly on top of it using a colored
                    "dashed" stroke where the single dash is deliberately
                    made as long as the entire circle's circumference
                    (`strokeDasharray`) — then `strokeDashoffset` shifts
                    that dash around the circle, which visually "hides" a
                    portion of it proportional to how much progress is
                    NOT yet complete. `-rotate-90` on the whole <svg> just
                    rotates the starting point from the 3 o'clock position
                    (SVG's default) up to 12 o'clock, which looks more
                    natural for a progress ring. */}
                <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border-strong)" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="34" fill="none" stroke="url(#grad)" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - completion / 100)}`}
                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                  />
                  <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--accent)" />
                      <stop offset="100%" stopColor="var(--accent-2)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{completion}%</span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                {checklist.map((c) => (
                  <div key={c.label} className="flex items-center gap-2 text-xs">
                    {c.done ? <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" /> : <Circle size={14} className="text-[var(--text-muted)] flex-shrink-0" />}
                    <span className={c.done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Decorative charts (see file-header note: sample data, not real stats) ---------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Placement Trend</h2>
            <span className="text-xs text-[var(--text-muted)]">Last 8 months</span>
          </div>
          {/* A simple bar chart built from plain <div>s, not a charting
              library — each bar's height is just set directly via inline
              CSS (`height: ${v}%`), which is a lightweight way to build a
              basic chart without pulling in a whole graphing dependency. */}
          <div className="flex items-end justify-between gap-2 h-40">
            {trendData.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-[var(--accent)]/40 to-[var(--accent)] transition-all hover:from-[var(--accent)]/60 hover:to-[var(--accent)]"
                  style={{ height: `${v}%`, animation: `slide-up 0.6s ease ${i * 0.08}s both` }}
                  title={`${v}%`}
                />
                <span className="text-[10px] text-[var(--text-muted)]">M{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Role Demand</h2>
            <span className="text-xs text-[var(--text-muted)]">Open positions</span>
          </div>
          <div className="space-y-3">
            {['Software Engineer', 'Data Analyst', 'Frontend Dev', 'Backend Dev', 'ML Engineer'].map((role, i) => {
              const pct = [85, 72, 64, 58, 45][i];
              return (
                <div key={role}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{role}</span>
                    <span className="text-[var(--text-muted)]">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--border-strong)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                      style={{ width: `${pct}%`, animation: `slide-in-right 0.8s ease ${i * 0.1}s both` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- Announcements + upcoming events preview ---------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone size={18} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Latest Announcements</h2>
            </div>
            <button onClick={() => onNavigate('announcements')} className="text-xs text-[var(--accent)] hover:underline">View all</button>
          </div>
          {announcements.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">No announcements yet.</p>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${a.priority === 'urgent' ? 'bg-rose-400' : a.priority === 'important' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                    <h3 className="text-sm font-medium truncate">{a.title}</h3>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{a.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Upcoming Events</h2>
            </div>
            <button onClick={() => onNavigate('events')} className="text-xs text-[var(--accent)] hover:underline">View all</button>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">No upcoming events.</p>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((e) => (
                <div key={e.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-start gap-3">
                    {/* A small "calendar page" style date badge — day
                        number + abbreviated month, stacked. */}
                    <div className="flex h-10 w-10 flex-col items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex-shrink-0">
                      <span className="text-xs font-bold">{new Date(e.event_date).getDate()}</span>
                      <span className="text-[8px] uppercase">{new Date(e.event_date).toLocaleString('default', { month: 'short' })}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium truncate">{e.title}</h3>
                      <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5"><Clock size={10} /> {new Date(e.event_date).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A reusable stat-card component, used 4 times above with different
// props — supports three different "bottom section" styles (a circular
// ring, a horizontal progress bar, or a mini bar chart), chosen based on
// which of `ring`/`progress`/`bars` was passed in.
function StatCard({
  icon: Icon, label, value, sub, trend, ring, progress, bars,
}: {
  icon: typeof Target; label: string; value: string; sub: string;
  trend: 'up' | 'flat'; ring?: number; progress?: number; bars?: boolean;
}) {
  return (
    <div className="card card-hover">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)]/15 to-[var(--accent-2)]/15 text-[var(--accent)]">
          <Icon size={20} />
        </div>
        {trend === 'up' && <TrendingUp size={16} className="text-emerald-400" />}
      </div>
      {/* `ring !== undefined` — if a ring value was explicitly passed
          (even 0), show the circular donut layout; otherwise fall
          through to the plain value + optional progress-bar/bars layout. */}
      {ring !== undefined ? (
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 flex-shrink-0">
            {/* Same donut-ring SVG technique explained in detail in the
                Profile Completion card above, just at a smaller size. */}
            <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" stroke="var(--border-strong)" strokeWidth="4" />
              <circle
                cx="28" cy="28" r="24" fill="none" stroke="url(#statgrad)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 24}`}
                strokeDashoffset={`${2 * Math.PI * 24 * (1 - ring / 100)}`}
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
              <defs>
                <linearGradient id="statgrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--accent-2)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-[var(--text-muted)]">{sub}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-[var(--text-muted)]">{sub}</div>
          {progress !== undefined && (
            <div className="mt-3 h-1.5 rounded-full bg-[var(--border-strong)] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all duration-700" style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
          )}
          {bars && (
            // A tiny 6-bar decorative sparkline — fixed sample heights,
            // purely visual flair (not derived from real data), similar
            // to the two bigger charts further down the page.
            <div className="mt-3 flex items-end gap-1 h-6">
              {[40, 65, 50, 80, 60, 90].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-[var(--accent)]/30" style={{ height: `${h}%`, animation: `slide-up 0.5s ease ${i * 0.06}s both` }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
