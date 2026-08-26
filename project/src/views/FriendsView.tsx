// ============================================================================
// src/views/FriendsView.tsx
//
// WHAT THIS FILE IS: the student-to-student social page — search for
// other students, send/accept/decline friend requests, see pending
// requests in both directions, and manage your accepted friends list
// (message, call, or remove them).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { useFeatureFlags } from '@/lib/featureFlags';
import { timeAgo } from '@/lib/data';
import { Search, UserPlus, Phone, MessageSquare, X, Check, Users, Clock } from 'lucide-react';
import { ProfileCardModal } from '@/components/ProfileCardModal';
import type { Friend, SearchResult } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
  onOpenConversation: (userId: string, name: string) => void;
  onStartCall: (calleeId: string, callType: 'friend' | 'interview') => void;
};

// A `friends` row only stores requester_id/recipient_id — this extended
// shape adds "otherId/otherName/etc" fields, precomputed once when
// loading, so the rest of the component doesn't have to keep figuring out
// "which side of this row is ME vs the OTHER person" every time it renders.
type FriendWithProfile = Friend & { otherId: string; otherName: string; otherAvatar: string; otherBranch: string; otherBio: string };

export function FriendsView({ onNavigate, onOpenConversation, onStartCall }: Props) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const flags = useFeatureFlags();
  const callsEnabled = flags.calls !== false;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState<FriendWithProfile[]>([]); // requests OTHERS sent TO the current user
  const [outgoing, setOutgoing] = useState<FriendWithProfile[]>([]); // requests the current user sent to OTHERS
  const [accepted, setAccepted] = useState<FriendWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null); // whose ProfileCardModal is currently open, if any

  // Calls a database function (`search_students`) rather than a plain
  // `.select()` query — this exists specifically because ordinary student
  // profiles have their email hidden by RLS from other students (see the
  // matching migration comment in supabase/setup.sql), and this RPC is a
  // narrow, safe exception that returns just enough info (name, avatar,
  // branch) to search by, without exposing anything private.
  const searchStudents = async (q: string) => {
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // Run BOTH the RPC and a direct `profiles` query every time, and
      // merge them, rather than only falling back to the direct query
      // when the RPC came back completely empty. The old "only fall back
      // if results.length === 0" check couldn't rescue a search where the
      // RPC returned SOME matches but was silently missing one specific
      // person (e.g. someone you just unfriended) — from the outside that
      // looks identical to "the RPC worked", so the fallback never ran and
      // that one person stayed invisible no matter how many times you
      // searched. Querying `profiles` directly is the reliable path here:
      // its RLS policy (`select_profiles`) is open to any authenticated
      // user with no friendship/role dependency at all, so nobody you've
      // ever friended-then-removed can get stuck unable to be found again.
      const [{ data, error }, direct] = await Promise.all([
        supabase.rpc('search_students', { q }),
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url, branch')
          .ilike('full_name', `%${q}%`)
          .neq('id', user?.id || '')
          .or('role.eq.student,role.is.null,role.eq.owner,role.eq.admin')
          .limit(20)
          .then((r) => r.data as SearchResult[] | null)
          .catch(() => null),
      ]);

      const fromRpc: SearchResult[] = error ? [] : ((data as SearchResult[]) || []);
      const fromDirect: SearchResult[] = direct || [];

      const byId = new Map<string, SearchResult>();
      [...fromRpc, ...fromDirect].forEach((r) => {
        if (r.id !== user?.id) byId.set(r.id, r);
      });

      setSearchResults(Array.from(byId.values()));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (searchQuery) {
      const t = setTimeout(() => searchStudents(searchQuery), 300);
      return () => clearTimeout(t);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Loads all three lists (incoming, outgoing, accepted) at once. This is
  // more involved than most `load` functions in this app because a
  // friendship row doesn't clearly say "who's the OTHER person" from a
  // fixed point of view — it depends on whether the CURRENT user is the
  // requester or the recipient of that specific row, so four separate
  // queries are needed to cover every combination.
  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    // Run all four queries in parallel. Each one uses Supabase's
    // "embedded resource" syntax — e.g. `profiles!friends_requester_id_fkey(...)`
    // — to fetch the OTHER person's profile fields (name, avatar, branch,
    // bio) joined directly into the same query, using the specific
    // foreign key relationship named in the database schema to
    // disambiguate WHICH of the two profile links (requester or
    // recipient) we mean.
    const [incomingRes, outgoingRes, accepted1Res, accepted2Res] = await Promise.all([
      supabase.from('friends').select('id, requester_id, status, created_at, profiles!friends_requester_id_fkey(full_name, avatar_url, branch, bio)').eq('recipient_id', user.id).eq('status', 'pending'),
      supabase.from('friends').select('id, recipient_id, status, profiles!friends_recipient_id_fkey(full_name, avatar_url, branch, bio)').eq('requester_id', user.id).eq('status', 'pending'),
      supabase.from('friends').select('id, requester_id, profiles!friends_requester_id_fkey(full_name, avatar_url, branch, bio)').eq('recipient_id', user.id).eq('status', 'accepted'),
      supabase.from('friends').select('id, recipient_id, profiles!friends_recipient_id_fkey(full_name, avatar_url, branch, bio)').eq('requester_id', user.id).eq('status', 'accepted'),
    ]);

    // A shared helper that turns the raw joined rows into the
    // FriendWithProfile shape described above. `isOutgoing` tells it
    // whether "the other person" is in the recipient_id or requester_id
    // field for THIS particular batch of rows.
    const mapFn = (rows: any[], isOutgoing: boolean) => (rows || []).map((r) => {
      const p = r.profiles || {};
      const otherId = isOutgoing ? r.recipient_id : r.requester_id;
      return { ...r, otherId, otherName: p.full_name || 'User', otherAvatar: p.avatar_url || '', otherBranch: p.branch || '', otherBio: p.bio || '' } as FriendWithProfile;
    });

    setIncoming(mapFn(incomingRes.data || [], false));
    setOutgoing(mapFn(outgoingRes.data || [], true));
    // Accepted friendships can exist with the current user as EITHER
    // side, so both accepted queries' results are combined into one list.
    setAccepted([...mapFn(accepted1Res.data || [], false), ...mapFn(accepted2Res.data || [], true)]);
    setLoading(false);
  };

  // Maps every user ID that the current user already has SOME relationship
  // with (pending either direction, or already accepted) to that
  // relationship's status + the underlying friends-table row ID. Search
  // results use this to decide which button to show, instead of always
  // rendering "Add" — without it, searching for someone you already sent a
  // request to (or are already friends with) showed an "Add" button that
  // looked like it worked but silently did nothing new server-side (the
  // request already existed), which read as "my friend request didn't
  // register" / "it let me send it again."
  const friendStatusMap = useMemo(() => {
    const map = new Map<string, { status: 'incoming' | 'outgoing' | 'accepted'; rowId: string }>();
    accepted.forEach((f) => map.set(f.otherId, { status: 'accepted', rowId: f.id }));
    outgoing.forEach((f) => map.set(f.otherId, { status: 'outgoing', rowId: f.id }));
    incoming.forEach((f) => map.set(f.otherId, { status: 'incoming', rowId: f.id }));
    return map;
  }, [incoming, outgoing, accepted]);

  useEffect(() => {
    loadAll();
    if (!user) return;

    // Live updates: reload the lists any time a friends-table row
    // involving this user is inserted or updated (a new request arrives,
    // one gets accepted, etc), from anyone, without needing to refresh
    // the page.
    const channel = supabase
      .channel('friends-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends', filter: `recipient_id=eq.${user.id}` }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends', filter: `requester_id=eq.${user.id}` }, () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friends', filter: `requester_id=eq.${user.id}` }, () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friends', filter: `recipient_id=eq.${user.id}` }, () => loadAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Sends a new friend request, after first checking whether some
  // relationship (in either direction) already exists between these two
  // people — this gives a clearer, more specific message ("already
  // friends" vs "request already sent" vs "they already sent YOU one")
  // than just letting the database's uniqueness rule reject a duplicate blindly.
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
      // Belt-and-suspenders: even with the manual check above, a race
      // condition (two requests sent within the same instant, from two
      // different tabs/devices) could still hit the database's own
      // uniqueness rule — code '23505' catches that and shows the same
      // friendly message instead of a raw database error.
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
    // Need to know who the ORIGINAL requester was, so we can notify
    // specifically them that their request was accepted.
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

  // Declining an incoming request, cancelling an outgoing one, and
  // removing an accepted friend are all, technically, the exact same
  // database action — delete the row — just triggered from different
  // places with different wording/confirmation. They're kept as separate
  // named functions purely for clarity in the JSX below (`onClick={() =>
  // declineFriend(f.id)}` reads clearly; a single generic
  // `deleteFriendRow` used in three different contexts would read less clearly).
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
    await loadAll();
    // Refresh search so the person can be found and re-added immediately
    if (searchQuery.trim().length >= 2) {
      await searchStudents(searchQuery.trim());
    }
  };

  // A small reusable avatar helper, local to this file (same "photo, or
  // colored initials" pattern used in several other components).
  const FriendAvatar = ({ name, url, size = 40 }: { name: string; url: string; size?: number }) =>
    url ? <img src={url} alt="" style={{ width: size, height: size }} className="rounded-xl object-cover flex-shrink-0" /> : (
      <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white flex-shrink-0">
        {name.slice(0, 2).toUpperCase()}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* ---------- Search ---------- */}
      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <Search size={18} className="text-[var(--accent)]" />
          <h2 className="text-lg font-semibold">Find Friends</h2>
        </div>
        <div className="search-field-wrap">
          <Search size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students by name…"
            className="search-field"
          />
        </div>
        {searching && <p className="mt-3 text-xs text-[var(--text-muted)]">Searching…</p>}
        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {searchResults.map((r) => {
              const rel = friendStatusMap.get(r.id);
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 animate-fade-in">
                  <button onClick={() => setViewProfileId(r.id)} className="flex flex-1 items-center gap-3 min-w-0 text-left">
                    <FriendAvatar name={r.full_name} url={r.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.full_name}</p>
                      {r.branch && <p className="text-xs text-[var(--text-muted)] truncate">{r.branch}</p>}
                    </div>
                  </button>
                  {!rel && (
                    <button onClick={() => sendRequest(r.id)} className="btn-primary btn-sm flex-shrink-0">
                      <UserPlus size={14} /> Add
                    </button>
                  )}
                  {rel?.status === 'outgoing' && (
                    <button disabled className="btn-ghost btn-sm flex-shrink-0 opacity-60">
                      <Clock size={14} /> Sent
                    </button>
                  )}
                  {rel?.status === 'incoming' && (
                    <button onClick={() => acceptFriend(rel.rowId)} className="btn-primary btn-sm flex-shrink-0">
                      <Check size={14} /> Accept
                    </button>
                  )}
                  {rel?.status === 'accepted' && (
                    <button disabled className="btn-ghost btn-sm flex-shrink-0 opacity-60">
                      <Check size={14} /> Friends
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- Pending requests (both directions) ---------- */}
      {/* This whole section only appears at all if there's at least one
          request in either direction — no empty "Pending Requests"
          section shown otherwise. */}
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
                      <button onClick={() => setViewProfileId(f.otherId)} className="flex flex-1 items-center gap-3 min-w-0 text-left">
                        <FriendAvatar name={f.otherName} url={f.otherAvatar} size={36} />
                        <span className="flex-1 text-sm font-medium truncate">{f.otherName}</span>
                      </button>
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
                      <button onClick={() => setViewProfileId(f.otherId)} className="flex flex-1 items-center gap-3 min-w-0 text-left">
                        <FriendAvatar name={f.otherName} url={f.otherAvatar} size={36} />
                        <span className="flex-1 text-sm font-medium truncate">{f.otherName}</span>
                      </button>
                      <button onClick={() => cancelRequest(f.id)} className="btn-ghost btn-sm flex-shrink-0">Cancel</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- Accepted friends list ---------- */}
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
                <button onClick={() => setViewProfileId(f.otherId)} className="flex w-full items-start gap-3 text-left">
                  <FriendAvatar name={f.otherName} url={f.otherAvatar} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{f.otherName}</p>
                    {f.otherBranch && <p className="text-xs text-[var(--text-muted)]">{f.otherBranch}</p>}
                    {f.otherBio && <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{f.otherBio}</p>}
                  </div>
                </button>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => { onNavigate('messages'); onOpenConversation(f.otherId, f.otherName); }} className="btn-ghost btn-sm flex-1">
                    <MessageSquare size={14} /> Message
                  </button>
                  {/* Calling is hidden entirely (not just disabled) if the
                      admin has turned the "calls" feature flag off. */}
                  {callsEnabled && (
                    <button onClick={() => onStartCall(f.otherId, 'friend')} className="btn-primary btn-sm flex-1">
                      <Phone size={14} /> Call
                    </button>
                  )}
                  <button onClick={() => removeFriend(f.id, f.otherName)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10" title="Remove">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clicking any name/avatar anywhere on this page opens the same
          shared ProfileCardModal, passed the callbacks it needs to also
          support "Message" and "Call" directly from within the popup. */}
      {viewProfileId && (
        <ProfileCardModal
          userId={viewProfileId}
          onClose={() => setViewProfileId(null)}
          onMessage={(id, name) => { onNavigate('messages'); onOpenConversation(id, name); }}
          onCall={callsEnabled ? (id) => onStartCall(id, 'friend') : undefined}
        />
      )}
    </div>
  );
}
