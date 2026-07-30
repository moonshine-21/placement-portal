import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { RefreshCw, FileText } from 'lucide-react';
import type { Application, Company } from '@/lib/supabase';

export function ApplicationsView() {
  const { profile } = useAuth();
  const [apps, setApps] = useState<(Application & { companies?: Company })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadApps = async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('applications')
      .select('*, companies(*)')
      .eq('student_id', profile.id)
      .order('applied_at', { ascending: false });
    setApps((data as (Application & { companies?: Company })[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadApps(); }, [profile]);

  const statusColors: Record<string, string> = {
    applied: 'bg-sky-500/15 text-sky-400',
    shortlisted: 'bg-emerald-500/15 text-emerald-400',
    rejected: 'bg-rose-500/15 text-rose-400',
    hired: 'bg-purple-500/15 text-purple-400',
  };

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>;
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your Applications</h2>
        <button onClick={loadApps} className="btn-ghost btn-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {apps.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileText size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">You haven't applied to any companies yet.</p>
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
              {apps.map((a) => {
                const c = a.companies;
                return (
                  <tr key={a.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        {c && <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: c.logo_color }}>{c.name.slice(0, 2).toUpperCase()}</div>}
                        <span className="font-medium">{c?.name || 'Company'}</span>
                      </div>
                    </td>
                    <td className="py-3 text-[var(--text-secondary)]">{c?.role || '—'}</td>
                    <td className="py-3 text-[var(--text-secondary)]">{c?.package_lpa ? `${c.package_lpa} LPA` : '—'}</td>
                    <td className="py-3">
                      <span className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${statusColors[a.status] || 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-[var(--text-muted)]">{new Date(a.applied_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
