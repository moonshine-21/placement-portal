// ============================================================================
// src/components/ProfileCardModal.tsx
//
// WHAT THIS FILE IS: the popup shown when you click on a STUDENT's name or
// avatar anywhere in the app — like CompanyProfileCardModal, but for
// people rather than companies, and with much more going on: it also
// shows their projects, mutual friends, and — the main extra complexity —
// the current friendship status between the viewer and this person
// (not friends yet / request sent / request received / already friends),
// with buttons that change based on which state it's in.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { X, MessageSquare, Phone, GraduationCap, Award, UserPlus, Check, Clock, Users, FolderGit2, ExternalLink, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { AdminBadge } from '@/components/AdminBadge';
import type { Profile, Friend, StudentProject } from '@/lib/supabase';

type Props = {
  userId: string;                                    // whose profile to show
  onClose: () => void;
  onMessage?: (userId: string, name: string) => void; // optional — not every screen that opens this modal wants a "Message" button
  onCall?: (userId: string) => void;                  // optional — likewise for "Call"
};

// The full set of possible friendship states between the viewer and this profile.
type FriendStatus = 'loading' | 'self' | 'none' | 'outgoing' | 'incoming' | 'accepted';

// A trimmed-down shape used just for showing mutual friends' avatars/names.
type MutualFriend = { id: string; full_name: string; avatar_url: string };

// Gets the full list of user IDs that `uid` is currently ACCEPTED friends
// with. Friendship rows can have either person as the "requester" or
// "recipient" — this checks both directions and combines the results,
// since being friends is symmetric even though the database row itself
// remembers who originally sent the request.
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
  const { user } = useAuth(); // the CURRENTLY logged-in viewer (not the profile being shown)
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [friendRowId, setFriendRowId] = useState<string | null>(null); // the ID of the existing friends-table row between these two, if any
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading');
  const [mutuals, setMutuals] = useState<MutualFriend[]>([]);
  const [busy, setBusy] = useState(false); // true while a friend-request action is in flight, to disable buttons and prevent double-clicks
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [showProjects, setShowProjects] = useState(false); // the projects list starts collapsed and expands on click

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(false);

      // Fetch the core profile first — this is the minimum needed to show
      // anything at all.
      const { data, error: err } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!active) return;
      if (err || !data) {
        console.error('Failed to load profile:', err);
        setError(true);
        setLoading(false);
        return;
      }
      setProfile(data as Profile);
      setLoading(false); // stop the main loading spinner as soon as we have the core profile — everything below loads in the background

      // Fetch their showcased projects separately (not blocking the main
      // profile display on this).
      supabase
        .from('student_projects')
        .select('*')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .then(({ data: proj }) => {
          if (active) setProjects((proj as StudentProject[]) || []);
        });

      if (!user) return; // not logged in — skip all the friendship logic below (nothing to compare against)

      if (user.id === userId) {
        // Viewing your OWN profile card — no friend button makes sense.
        setFriendStatus('self');
        return;
      }

      // Look for an existing friends-table row between these two people,
      // in EITHER direction (`.or(...)` checks both "I requested them" and
      // "they requested me" in one query).
      const { data: row } = await supabase
        .from('friends')
        .select('id, status, requester_id, recipient_id')
        .or(`and(requester_id.eq.${user.id},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${user.id})`)
        .maybeSingle();

      if (!active) return;

      if (!row) {
        setFriendStatus('none'); // no relationship at all yet
      } else {
        const f = row as Friend;
        setFriendRowId(f.id);
        if (f.status === 'accepted') setFriendStatus('accepted');
        // If the row's status is still 'pending', figure out WHICH
        // direction it's pending in — did I send it, or did they?
        else if (f.requester_id === user.id) setFriendStatus('outgoing');
        else setFriendStatus('incoming');
      }

      // Compute mutual friends: get both people's full accepted-friends
      // lists, then find the overlap.
      const [myFriends, theirFriends] = await Promise.all([
        getAcceptedFriendIds(user.id),
        getAcceptedFriendIds(userId),
      ]);
      const theirSet = new Set(theirFriends); // a Set makes the "is this ID in their list?" check below fast
      const mutualIds = myFriends.filter((id) => theirSet.has(id));
      if (!active || mutualIds.length === 0) return;

      // Fetch just the name/avatar of each mutual friend, for display.
      const { data: mutualProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', mutualIds);
      if (active) setMutuals((mutualProfiles as MutualFriend[]) || []);
    };

    load();
    return () => { active = false; };
  }, [userId, user]);

  // Sends a new friend request from the viewer to this profile's owner.
  const sendRequest = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from('friends').insert({ requester_id: user.id, recipient_id: userId, status: 'pending' });
    if (error) {
      // Postgres error code '23505' means "unique constraint violation" —
      // in this case, that almost certainly means a friend request between
      // these two already exists (perhaps sent moments ago from another
      // tab), so we show a gentler "already sent" message instead of a
      // generic error.
      showToast(error.code === '23505' ? 'Request already sent' : 'Could not send request', error.code === '23505' ? 'info' : 'error');
      setBusy(false);
      return;
    }
    // Notify the other person they've received a request.
    await supabase.from('notifications').insert({
      user_id: userId, type: 'friend_request',
      title: `${profile?.full_name || 'Someone'} sent you a friend request`,
      body: 'Tap to view and accept in the Friends tab.', link_view: 'friends',
    });
    showToast('Friend request sent!', 'success');
    setFriendStatus('outgoing');
    setBusy(false);
  };

  // Accepts an incoming friend request.
  const acceptRequest = async () => {
    if (!friendRowId || !user) return;
    setBusy(true);
    await supabase.from('friends').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendRowId);
    // Let the original requester know their request was accepted.
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
        className="profile-popover w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden scroll-thin animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner — same treatment as the "view my profile" popover in the
            header (AppShell.tsx), so a student's card looks identical
            whether it's opened on themselves or by someone else: a photo
            banner if they've uploaded one, otherwise the same glowing
            accent-color gradient. Height is set inline (rather than via a
            Tailwind class) because the shared `.profile-popover-banner`
            CSS class hard-codes its own 108px height for the smaller
            header dropdown — a Tailwind class here would silently lose
            that cascade fight and the banner would collapse back down
            over the avatar below. The inline style always wins. */}
        <div
          className="profile-popover-banner relative w-full overflow-hidden rounded-t-[18px]"
          style={{ height: 170 }}
        >
          {profile?.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
          <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 pt-0">
        {loading ? (
          <div className="space-y-3">
            <div className="-mt-14 flex items-end gap-3">
              <div className="skeleton h-32 w-32 rounded-3xl" />
            </div>
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-16" />
          </div>
        ) : error || !profile ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">Couldn't load this profile. It may have been removed.</p>
          </div>
        ) : (
          <>
            {/* Avatar overlapping the banner, bottom-left — the same
                low-left placement as the header's own profile popover —
                with name/branch to its right so the identity block reads
                left-to-right instead of the old centered stack. Sized and
                offset so a good chunk of the banner still shows above it
                (Discord-style) instead of the banner swallowing it. */}
            <div className="-mt-14 flex items-end gap-4">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="profile-popover-avatar h-32 w-32 flex-shrink-0 rounded-3xl border-4 border-[var(--bg-elevated)] object-cover"
                />
              ) : (
                <div className="profile-popover-avatar flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-3xl border-4 border-[var(--bg-elevated)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-3xl font-bold text-white">
                  {(profile.full_name || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 pb-2">
                <p className="flex items-center gap-1.5 truncate text-xl font-bold text-[var(--text-primary)]">
                  {profile.full_name || 'Unnamed Student'}
                  {(profile.role === 'admin' || profile.role === 'owner') && <AdminBadge role={profile.role} />}
                </p>
                {profile.branch && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
                    <GraduationCap size={12} /> {profile.branch}
                  </p>
                )}
              </div>
            </div>

            {profile.bio && (
              <p className="mt-5 text-sm leading-5 text-[var(--text-secondary)]">{profile.bio}</p>
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

            {/* Collapsible projects section — only shown at all if the
                student has at least one project, and starts collapsed to
                keep the card compact. */}
            {projects.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowProjects((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold uppercase text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  <span className="flex items-center gap-1">
                    <FolderGit2 size={12} /> Projects ({projects.length})
                  </span>
                  {showProjects ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showProjects && (
                  <div className="mt-2 space-y-2">
                    {projects.map((p) => (
                      <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left">
                        {p.image_url && (
                          <div className="mb-2 -mx-3 -mt-3 h-24 overflow-hidden rounded-t-xl">
                            <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{p.title}</p>
                          {/* Only show the external link icon if the
                              project actually has a URL to link to. */}
                          {p.project_url && (
                            <a href={p.project_url} target="_blank" rel="noreferrer" className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)]">
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                        {/* `line-clamp-3` truncates the description to 3
                            lines with a "..." if it's longer, so one
                            long project description can't blow up the card's height. */}
                        {p.description && <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-3">{p.description}</p>}
                        {p.tech_stack?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {p.tech_stack.map((t) => (
                              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                                <Code2 size={10} /> {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mutual friends row — capped at showing 6 even if there are
                more, to keep the card a reasonable size. */}
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

            {/* Action buttons row — which buttons appear depends on both
                the friendship status AND whether the caller of this modal
                even wanted a Message/Call option (via the optional
                onMessage/onCall props). */}
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
              {/* Calling is only offered once you're actually friends —
                  makes sense given calls are a more personal action than messaging. */}
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
    </div>
  );
}
