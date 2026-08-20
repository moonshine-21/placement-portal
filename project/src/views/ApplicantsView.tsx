// ============================================================================
// src/views/ApplicantsView.tsx
//
// WHAT THIS FILE IS: the company-side page listing everyone who has
// applied to that company — view their resume, change their application
// status (which also notifies the student), message them, or start a
// video "interview" call with them.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { useFeatureFlags } from '@/lib/featureFlags';
import { openPrivateFile, timeAgo } from '@/lib/data';
import { FileText, MessageSquare, Phone, Eye } from 'lucide-react';
import type { CompanyApplication } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
  onOpenConversation: (userId: string, name: string) => void;
  onStartCall: (calleeId: string, callType: 'friend' | 'interview') => void;
};

// The exact allowed values for an application's status, matching the
// database's own CHECK constraint (see the CompanyApplication type in
// supabase.ts) — `as const` here tells TypeScript to treat this as a
// fixed list of exact text values, not just "an array of strings," which
// is what lets the dropdown below be type-checked against it.
const STATUSES = ['submitted', 'pending', 'viewed', 'shortlisted', 'rejected', 'hired'] as const;

export function ApplicantsView({ onNavigate, onOpenConversation, onStartCall }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  // Respect the admin's "calls" feature flag — hide the Interview call
  // button entirely if calling has been turned off site-wide.
  const callsEnabled = useFeatureFlags().calls !== false;
  const [apps, setApps] = useState<CompanyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CompanyApplication | null>(null); // the applicant currently shown in the "Details" popup, if any

  const loadApps = async () => {
    if (!profile) return;
    const { data } = await supabase.from('company_applications').select('*').eq('company_id', profile.id).order('created_at', { ascending: false });
    setApps((data as CompanyApplication[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadApps(); }, [profile?.id]);

  // Changes one applicant's status (e.g. moving them to "shortlisted"),
  // and notifies the student about the change via the bell-icon
  // notification system.
  const updateStatus = async (app: CompanyApplication, status: string) => {
    await supabase.from('company_applications').update({ status }).eq('id', app.id);
    await supabase.from('notifications').insert({
      user_id: app.student_id, type: 'status',
      title: `Your application is now "${status}"`,
      body: profile?.full_name || 'Company', link_view: 'applications',
    });
    showToast(`Status updated to ${status}`, 'success');
    loadApps();
    // If the details popup for THIS applicant happens to be open right
    // now, update it in place too, so it doesn't show a stale status
    // until the popup is closed and reopened.
    if (selected?.id === app.id) setSelected({ ...app, status: status as CompanyApplication['status'] });
  };

  // Picks a background/text color for the status dropdown based on which
  // status it currently shows — a quick visual "at a glance" cue.
  const statusColor = (s: string) => ({
    submitted: 'bg-sky-500/15 text-sky-400', pending: 'bg-amber-500/15 text-amber-400',
    viewed: 'bg-indigo-500/15 text-indigo-400', shortlisted: 'bg-emerald-500/15 text-emerald-400',
    rejected: 'bg-rose-500/15 text-rose-400', hired: 'bg-purple-500/15 text-purple-400',
  }[s] || 'bg-[var(--surface)] text-[var(--text-secondary)]');

  if (loading) return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}</div>;

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Applicants</h2>
        <span className="text-sm text-[var(--text-muted)]">{apps.length} applicants</span>
      </div>

      {apps.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <FileText size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No applicants yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <div key={a.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 animate-fade-in">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* A simple initials avatar (this page doesn't have room
                      to fetch/show each applicant's real profile photo,
                      so it uses their name's first two letters instead). */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white flex-shrink-0">{(a.full_name || 'A').slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{a.full_name || 'Applicant'}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{a.email || '—'} · {a.phone || '—'}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Applied {timeAgo(a.created_at)}</p>
                  </div>
                </div>
                {/* The status dropdown IS the status-changing control —
                    picking a new option immediately calls updateStatus,
                    there's no separate "save" step. */}
                <select
                  value={a.status}
                  onChange={(e) => updateStatus(a, e.target.value)}
                  className={`input-field !py-1.5 !text-xs !w-auto rounded-lg font-medium ${statusColor(a.status)}`}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {/* Resume link only shown if they actually uploaded one
                    with this specific application. */}
                {a.resume_url && <button onClick={() => openPrivateFile('resumes', a.resume_url)} className="btn-ghost btn-sm"><FileText size={14} /> View Resume</button>}
                <button onClick={() => setSelected(a)} className="btn-ghost btn-sm"><Eye size={14} /> Details</button>
                <button onClick={() => { onNavigate('messages'); onOpenConversation(a.student_id, a.full_name); }} className="btn-ghost btn-sm"><MessageSquare size={14} /> Message</button>
                {callsEnabled && <button onClick={() => onStartCall(a.student_id, 'interview')} className="btn-primary btn-sm"><Phone size={14} /> Interview</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The "Details" popup — a simple summary card with everything the
          compact list row didn't have room to show (full address, any
          note the applicant left). */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setSelected(null)}>
          <div className="glass w-full max-w-md p-6 animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{selected.full_name}</h3>
              <button onClick={() => setSelected(null)} className="text-[var(--text-muted)] hover:text-rose-400 text-xl">×</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Email</span><span>{selected.email || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Phone</span><span>{selected.phone || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Address</span><span className="text-right">{selected.address || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Resume</span>{selected.resume_url ? <button onClick={() => openPrivateFile('resumes', selected.resume_url)} className="text-[var(--accent)] hover:underline">Open</button> : <span>—</span>}</div>
              {selected.comment && <div><span className="text-[var(--text-muted)]">Comment:</span><p className="mt-1 text-[var(--text-secondary)]">{selected.comment}</p></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
