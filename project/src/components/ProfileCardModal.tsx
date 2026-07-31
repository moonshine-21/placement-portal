import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { X, MessageSquare, Phone, GraduationCap, Award, UserPlus, Check, Clock, Users } from 'lucide-react';
import type { Profile, Friend } from '@/lib/supabase';

type Props = {
  userId: string;
  onClose: () => void;
  onMessage?: (userId: string, name: string) => void;
  onCall?: (userId: string) => void;
};

type FriendStatus = 'loading' | 'self' | 'none' | 'outgoing' | 'incoming' | 'accepted';

type MutualFriend = { id: string; full_name: string; avatar_url: string };

async function getAcceptedFriendIds(uid: string): Promise<string[]> {
  const [a, b] = await Promise.all([
    supabase.from('friends').select('recipient_id').eq('requester_id', uid).eq('status', 'accepted'),
    supabase.from('friends').select('requester_id').eq('recipient_id', uid).eq('status', 'accepted'),
  ]);
  const ids = [
    ...(a.data || []).map((r: { recipient_id: string }) => r.recipient_id),
    ...(b.data || []).map((r: { requester_id: string }) => r.requester_id),
  ];
  return ids;
}

export function ProfileCardModal({ userId, onClose, onMessage, onCall }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [friendRowId, setFriendRowId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading');
  const [mutuals, setMutuals] = useState<MutualFriend[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(false);

      const { data, error: err } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!active) return;
      if (err || !data) {
        console.error('Failed to load profile:', err);
        setError(true);
        setLoading(false);
        return;
      }
      setProfile(data as Profile);
      setLoading(false);

      if (!user) return;

      if (user.id === userId) {
        setFriendStatus('self');
        return;
      }

      const { data: row } = await supabase
        .from('friends')
        .select('id, status, requester_id, recipient_id')
        .or(`and(requester_id.eq.${user.id},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${user.id})`)
        .maybeSingle();

      if (!active) return;

      if (!row) {
        setFriendStatus('none');
      } else {
        const f = row as Friend;
        setFriendRowId(f.id);
        if (f.status === 'accepted') setFriendStatus('accepted');
        else if (f.requester_id === user.id) setFriendStatus('outgoing');
        else setFriendStatus('incoming');
      }

      const [myFriends, theirFriends] = await Promise.all([
        getAcceptedFriendIds(user.id),
        getAcceptedFriendIds(userId),
      ]);
      const theirSet = new Set(theirFriends);
      const mutualIds = myFriends.filter((id) => theirSet.has(id));
      if (!active || mutualIds.length === 0) return;

      const { data: mutualProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', mutualIds);
      if (active) setMutuals((mutualProfiles as MutualFriend[]) || []);
    };

    load();
    return () => { active = false; };
  }, [userId, user]);

  const sendRequest = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from('friends').insert({ requester_id: user.id, recipient_id: userId, status: 'pending' });
    if (error) {
      showToast(error.code === '23505' ? 'Request already sent' : 'Could not send request', error.code === '23505' ? 'info' : 'error');
      setBusy(false);
      return;
    }
    await supabase.from('notifications').insert({
      user_id: userId, type: 'friend_request',
      title: `${profile?.full_name || 'Someone'} sent you a friend request`,
      body: 'Tap to view and accept in the Friends tab.', link_view: 'friends',
    });
    showToast('Friend request sent!', 'success');
    setFriendStatus('outgoing');
    setBusy(false);
  };

  const acceptRequest = async () => {
    if (!friendRowId || !user) return;
    setBusy(true);
    await supabase.from('friends').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendRowId);
    await supabase.from('notifications').insert({
      user_id: userId, type: 'friend_accepted',
      title: `${user.user_metadata?.full_name || 'Someone'} accepted your friend request`,
      body: 'You are now friends.', link_view: 'friends',
    });
    showToast('Friend added!', 'success');
    setFriendStatus('accepted');
    setBusy(false);
  };

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

            {mutuals.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                  <Users size={12} /> Mutual Friends ({mutuals.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {mutuals.slice(0, 6).map((m) => (
                    <div key={m.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-5 w-5 rounded-md object-cover" />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[9px] font-bold text-white">
                          {(m.full_name || 'U').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-[var(--text-secondary)]">{m.full_name || 'User'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2">
              {friendStatus === 'none' && (
                <button onClick={sendRequest} disabled={busy} className="btn-primary btn-sm flex-1">
                  <UserPlus size={14} /> Add Friend
                </button>
              )}
              {friendStatus === 'outgoing' && (
                <button disabled className="btn-ghost btn-sm flex-1 opacity-60">
                  <Clock size={14} /> Request Sent
                </button>
              )}
              {friendStatus === 'incoming' && (
                <button onClick={acceptRequest} disabled={busy} className="btn-primary btn-sm flex-1">
                  <Check size={14} /> Accept Request
                </button>
              )}

              {onMessage && (
                <button
                  onClick={() => { onMessage(profile.id, profile.full_name || 'User'); onClose(); }}
                  className="btn-ghost btn-sm flex-1"
                >
                  <MessageSquare size={14} /> Message
                </button>
              )}
              {onCall && friendStatus === 'accepted' && (
                <button
                  onClick={() => { onCall(profile.id); onClose(); }}
                  className="btn-primary btn-sm flex-1"
                >
                  <Phone size={14} /> Call
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
