import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/data';
import { Search, UserPlus, Phone, MessageSquare, X, Check, Users, Clock } from 'lucide-react';
import type { Friend, SearchResult } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
  onOpenConversation: (userId: string, name: string) => void;
  onStartCall: (calleeId: string, callType: 'friend' | 'interview') => void;
};

type FriendWithProfile = Friend & { otherName: string; otherAvatar: string; otherBranch: string; otherBio: string };

export function FriendsView({ onNavigate, onOpenConversation, onStartCall }: Props) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState<FriendWithProfile[]>([]);
  const [outgoing, setOutgoing] = useState<FriendWithProfile[]>([]);
  const [accepted, setAccepted] = useState<FriendWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const searchStudents = async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase.rpc('search_students', { q });
    setSearchResults(((data as SearchResult[]) || []).filter((r) => r.id !== user?.id));
    setSearching(false);
  };

  useEffect(() => {
    if (searchQuery) {
      const t = setTimeout(() => searchStudents(searchQuery), 300);
      return () => clearTimeout(t);
    }
  }, [searchQuery]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    const [incomingRes, outgoingRes, accepted1Res, accepted2Res] = await Promise.all([
      supabase.from('friends').select('id, requester_id, status, created_at, profiles!friends_requester_id_fkey(full_name, avatar_url, branch, bio)').eq('recipient_id', user.id).eq('status', 'pending'),
      supabase.from('friends').select('id, recipient_id, status, profiles!friends_recipient_id_fkey(full_name, avatar_url, branch, bio)').eq('requester_id', user.id).eq('status', 'pending'),
      supabase.from('friends').select('id, requester_id, profiles!friends_requester_id_fkey(full_name, avatar_url, branch, bio)').eq('recipient_id', user.id).eq('status', 'accepted'),
      supabase.from('friends').select('id, recipient_id, profiles!friends_recipient_id_fkey(full_name, avatar_url, branch, bio)').eq('requester_id', user.id).eq('status', 'accepted'),
    ]);

    const mapFn = (rows: any[], isOutgoing: boolean) => (rows || []).map((r) => {
      const p = r.profiles || {};
      const otherId = isOutgoing ? r.recipient_id : r.requester_id;
      return { ...r, otherId, otherName: p.full_name || 'User', otherAvatar: p.avatar_url || '', otherBranch: p.branch || '', otherBio: p.bio || '' } as FriendWithProfile;
    });

    setIncoming(mapFn(incomingRes.data || [], false));
    setOutgoing(mapFn(outgoingRes.data || [], true));
    setAccepted([...mapFn(accepted1Res.data || [], false), ...mapFn(accepted2Res.data || [], true)]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    if (!user) return;

    const channel = supabase
      .channel('friends-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends', filter: `recipient_id=eq.${user.id}` }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends', filter: `requester_id=eq.${user.id}` }, () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friends', filter: `requester_id=eq.${user.id}` }, () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friends', filter: `recipient_id=eq.${user.id}` }, () => loadAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const sendRequest = async (recipientId: string) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('friends')
      .select('id, status, requester_id')
      .or(`and(requester_id.eq.${user.id},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${user.id})`)
      .maybeSingle();
    if (existing) {
      const f = existing as Friend;
      if (f.status === 'accepted') { showToast('You are already friends', 'info'); return; }
      if (f.status === 'pending' && f.requester_id === user.id) { showToast('Request already sent', 'info'); return; }
      if (f.status === 'pending') { showToast('They already sent you a request — check incoming!', 'info'); return; }
    }

    const { error } = await supabase.from('friends').insert({ requester_id: user.id, recipient_id: recipientId, status: 'pending' });
    if (error) {
      if (error.code === '23505') { showToast('Request already sent', 'info'); return; }
      showToast('Could not send request', 'error'); return;
    }
    await supabase.from('notifications').insert({
      user_id: recipientId, type: 'friend_request',
      title: `${profile?.full_name || 'Someone'} sent you a friend request`,
      body: 'Tap to view and accept in the Friends tab.', link_view: 'friends',
    });
    showToast('Friend request sent!', 'success');
    loadAll();
  };

  const acceptFriend = async (friendRowId: string) => {
    const { data: row } = await supabase.from('friends').select('requester_id').eq('id', friendRowId).maybeSingle();
    await supabase.from('friends').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendRowId);
    if (row) {
      await supabase.from('notifications').insert({
        user_id: (row as Friend).requester_id, type: 'friend_accepted',
        title: `${profile?.full_name || 'Someone'} accepted your friend request`,
        body: 'You are now friends.', link_view: 'friends',
      });
    }
    showToast('Friend added!', 'success');
    loadAll();
  };

  const declineFriend = async (friendRowId: string) => {
    await supabase.from('friends').delete().eq('id', friendRowId);
    showToast('Request declined', 'info');
    loadAll();
  };

  const cancelRequest = async (friendRowId: string) => {
    await supabase.from('friends').delete().eq('id', friendRowId);
    showToast('Request cancelled', 'info');
    loadAll();
  };

  const removeFriend = async (friendRowId: string, name: string) => {
    if (!confirm(`Remove ${name} from your friends?`)) return;
    await supabase.from('friends').delete().eq('id', friendRowId);
    showToast('Friend removed', 'info');
    loadAll();
  };

  const FriendAvatar = ({ name, url, size = 40 }: { name: string; url: string; size?: number }) =>
    url ? <img src={url} alt="" style={{ width: size, height: size }} className="rounded-xl object-cover flex-shrink-0" /> : (
      <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white flex-shrink-0">
        {name.slice(0, 2).toUpperCase()}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <Search size={18} className="text-[var(--accent)]" />
          <h2 className="text-lg font-semibold">Find Friends</h2>
        </div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students by name…"
            className="input-field pl-10 py-2.5 text-sm"
          />
        </div>
        {searching && <p className="mt-3 text-xs text-[var(--text-muted)]">Searching…</p>}
        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {searchResults.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 animate-fade-in">
                <FriendAvatar name={r.full_name} url={r.avatar_url} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.full_name}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{r.email}</p>
                </div>
                <button onClick={() => sendRequest(r.id)} className="btn-primary btn-sm flex-shrink-0">
                  <UserPlus size={14} /> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending requests */}
      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} className="text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Pending Requests</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase text-[var(--text-muted)]">Incoming ({incoming.length})</h3>
              {incoming.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No incoming requests.</p> : (
                <div className="space-y-2">
                  {incoming.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 animate-fade-in">
                      <FriendAvatar name={f.otherName} url={f.otherAvatar} size={36} />
                      <span className="flex-1 text-sm font-medium truncate">{f.otherName}</span>
                      <button onClick={() => acceptFriend(f.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25" title="Accept">
                        <Check size={16} />
                      </button>
                      <button onClick={() => declineFriend(f.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25" title="Decline">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase text-[var(--text-muted)]">Outgoing ({outgoing.length})</h3>
              {outgoing.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No outgoing requests.</p> : (
                <div className="space-y-2">
                  {outgoing.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 animate-fade-in">
                      <FriendAvatar name={f.otherName} url={f.otherAvatar} size={36} />
                      <span className="flex-1 text-sm font-medium truncate">{f.otherName}</span>
                      <button onClick={() => cancelRequest(f.id)} className="btn-ghost btn-sm flex-shrink-0">Cancel</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Friends list */}
      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <Users size={18} className="text-[var(--accent)]" />
          <h2 className="text-lg font-semibold">Your Friends</h2>
          <span className="text-sm text-[var(--text-muted)]">({accepted.length})</span>
        </div>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
        ) : accepted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users size={28} className="text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No friends yet. Search above to find students!</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {accepted.map((f) => (
              <div key={f.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--border-strong)] animate-fade-in">
                <div className="flex items-start gap-3">
                  <FriendAvatar name={f.otherName} url={f.otherAvatar} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{f.otherName}</p>
                    {f.otherBranch && <p className="text-xs text-[var(--text-muted)]">{f.otherBranch}</p>}
                    {f.otherBio && <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{f.otherBio}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => { onNavigate('messages'); onOpenConversation(f.otherId, f.otherName); }} className="btn-ghost btn-sm flex-1">
                    <MessageSquare size={14} /> Message
                  </button>
                  <button onClick={() => onStartCall(f.otherId, 'friend')} className="btn-primary btn-sm flex-1">
                    <Phone size={14} /> Call
                  </button>
                  <button onClick={() => removeFriend(f.id, f.otherName)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10" title="Remove">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
