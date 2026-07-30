import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { RefreshCw, FileText, Building2 } from 'lucide-react';
import type { Application, Company, CompanyApplication } from '@/lib/supabase';

type TrackedApp = {
  id: string;
  source: 'match' | 'company';
  companyName: string;
  role: string;
  packageLabel: string;
  status: string;
  appliedAt: string;
  logoColor?: string;
  comment?: string;
};

export function ApplicationsView() {
  const { profile, user } = useAuth();
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [loading, setLoading] = useState(true);

  const loadApps = async () => {
    if (!profile || !user) return;
    setLoading(true);

    const [{ data: matchApps }, { data: companyApps }, { data: companyProfs }] = await Promise.all([
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

    const orgMap = new Map<string, string>();
    (companyProfs || []).forEach((c: { id: string; org_name: string }) => {
      orgMap.set(c.id, c.org_name || 'Company');
    });

    const tracked: TrackedApp[] = [];

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

    ((companyApps as CompanyApplication[]) || []).forEach((a) => {
      tracked.push({
        id: a.id,
        source: 'company',
        companyName: orgMap.get(a.company_id) || 'Company',
        role: a.job_id ? 'Job application' : 'Direct application',
        packageLabel: '—',
        status: a.status || 'pending',
        appliedAt: a.created_at,
        comment: a.comment,
      });
    });

    tracked.sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
    setApps(tracked);
    setLoading(false);
  };

  useEffect(() => {
    loadApps();
    if (!user) return;

    // Live updates when company changes application status
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

    // Fallback poll so status still moves even if realtime is off
    const poll = setInterval(loadApps, 8000);

    return () => {
      try { supabase.removeChannel(ch1); } catch { /* */ }
      try { supabase.removeChannel(ch2); } catch { /* */ }
      clearInterval(poll);
    };
  }, [profile, user]);

  const statusColors: Record<string, string> = {
    applied: 'bg-sky-500/15 text-sky-400',
    submitted: 'bg-sky-500/15 text-sky-400',
    pending: 'bg-amber-500/15 text-amber-400',
    viewed: 'bg-indigo-500/15 text-indigo-400',
    shortlisted: 'bg-emerald-500/15 text-emerald-400',
    rejected: 'bg-rose-500/15 text-rose-400',
    hired: 'bg-purple-500/15 text-purple-400',
  };

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
                <tr key={`${a.source}-${a.id}`} className="border-b border-[var(--border)] last:border-0 animate-fade-in">
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
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
