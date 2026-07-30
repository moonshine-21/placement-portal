import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, MessageSquare, Phone, GraduationCap, Award } from 'lucide-react';
import type { Profile } from '@/lib/supabase';

type Props = {
  userId: string;
  onClose: () => void;
  onMessage?: (userId: string, name: string) => void;
  onCall?: (userId: string) => void;
};

export function ProfileCardModal({ userId, onClose, onMessage, onCall }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err || !data) {
          console.error('Failed to load profile:', err);
          setError(true);
        } else {
          setProfile(data as Profile);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md p-6 max-h-[90vh] overflow-y-auto scroll-thin animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Student Profile</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-rose-400">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-3 py-6">
            <div className="skeleton mx-auto h-20 w-20 rounded-2xl" />
            <div className="skeleton mx-auto h-4 w-1/2" />
            <div className="skeleton h-16" />
          </div>
        ) : error || !profile ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">Couldn't load this profile. It may have been removed.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xl font-bold text-white">
                  {(profile.full_name || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-lg font-semibold">{profile.full_name || 'Unnamed Student'}</p>
                {profile.branch && (
                  <p className="flex items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
                    <GraduationCap size={12} /> {profile.branch}
                  </p>
                )}
              </div>
            </div>

            {profile.bio && (
              <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">{profile.bio}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
                <p className="text-xs text-[var(--text-muted)]">CGPA</p>
                <p className="text-sm font-semibold">{profile.cgpa ? profile.cgpa : '—'}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
                <p className="text-xs text-[var(--text-muted)]">Profile</p>
                <p className="text-sm font-semibold">{profile.profile_completion || 0}%</p>
              </div>
            </div>

            {profile.skills && profile.skills.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                  <Award size={12} /> Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((s) => (
                    <span key={s} className="rounded-md bg-[var(--accent)]/10 px-2 py-1 text-xs text-[var(--accent)]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(onMessage || onCall) && (
              <div className="mt-5 flex items-center gap-2">
                {onMessage && (
                  <button
                    onClick={() => { onMessage(profile.id, profile.full_name || 'User'); onClose(); }}
                    className="btn-ghost btn-sm flex-1"
                  >
                    <MessageSquare size={14} /> Message
                  </button>
                )}
                {onCall && (
                  <button
                    onClick={() => { onCall(profile.id); onClose(); }}
                    className="btn-primary btn-sm flex-1"
                  >
                    <Phone size={14} /> Call
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
