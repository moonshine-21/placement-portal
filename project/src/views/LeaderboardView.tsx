import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trophy, Medal, Award, TrendingUp, Target, Star } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/supabase';

export function LeaderboardView() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_leaderboard', { limit_count: 50 });
      if (error) { console.error('Leaderboard load failed:', error); setLoading(false); return; }
      setEntries((data as LeaderboardEntry[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-12 text-center">
        <Trophy size={32} className="text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-muted)]">No students ranked yet. Complete your profiles to appear on the leaderboard!</p>
      </div>
    );
  }

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Medal size={20} className="text-amber-400" />;
    if (rank === 2) return <Medal size={20} className="text-slate-400" />;
    if (rank === 3) return <Medal size={20} className="text-orange-400" />;
    return <span className="text-sm font-bold text-[var(--text-muted)]">#{rank}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Trophy size={20} className="text-[var(--accent)]" />
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <span className="text-sm text-[var(--text-muted)]">· Ranked by profile, skills, and matches</span>
      </div>

      {/* Top 3 podium */}
      {top3.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3 stagger">
          {top3.map((e, i) => (
            <div
              key={e.student_id}
              className={`card text-center ${i === 0 ? 'sm:scale-105 ring-2 ring-amber-400/30' : ''}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-lg font-bold text-white">
                {e.avatar_url ? <img src={e.avatar_url} alt="" className="h-full w-full rounded-2xl object-cover" /> : e.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex items-center justify-center gap-2 mb-1">
                {rankIcon(e.rank)}
                <span className="text-sm font-bold">{e.full_name}</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{e.branch || '—'}</p>
              <div className="mt-3 flex justify-center gap-4 text-xs">
                <div className="flex flex-col items-center">
                  <span className="font-bold text-[var(--text-primary)]">{e.skills_count}</span>
                  <span className="text-[var(--text-muted)]">Skills</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-bold text-[var(--text-primary)]">{e.high_matches}</span>
                  <span className="text-[var(--text-muted)]">High Matches</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-bold text-[var(--text-primary)]">{e.profile_completion}%</span>
                  <span className="text-[var(--text-muted)]">Profile</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rest of the leaderboard */}
      {rest.length > 0 && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="pb-3 font-medium">Rank</th>
                  <th className="pb-3 font-medium">Student</th>
                  <th className="pb-3 font-medium">Branch</th>
                  <th className="pb-3 font-medium">CGPA</th>
                  <th className="pb-3 font-medium">Skills</th>
                  <th className="pb-3 font-medium">Matches</th>
                  <th className="pb-3 font-medium">Profile</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((e) => (
                  <tr key={e.student_id} className="border-b border-[var(--border)] last:border-0 animate-fade-in">
                    <td className="py-3">{rankIcon(e.rank)}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        {e.avatar_url ? <img src={e.avatar_url} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">{e.full_name.slice(0, 2).toUpperCase()}</div>}
                        <span className="font-medium">{e.full_name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-[var(--text-secondary)]">{e.branch || '—'}</td>
                    <td className="py-3 text-[var(--text-secondary)]">{e.cgpa || '—'}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]"><Star size={12} className="text-[var(--accent)]" /> {e.skills_count}</span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]"><Target size={12} className="text-emerald-400" /> {e.total_matches}</span>
                      {e.high_matches > 0 && <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-400"><TrendingUp size={10} /> {e.high_matches} high</span>}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-[var(--border-strong)] overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${e.profile_completion}%` }} />
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">{e.profile_completion}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
