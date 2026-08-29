// ============================================================================
// src/views/MessagesView.tsx
//
// WHAT THIS FILE IS: the direct-messages (DM) page — a two-column layout
// (conversation list on the left, the open thread on the right, collapsing
// to a single column on mobile). Supports text, file attachments, inline
// quiz cards, live updates via Supabase realtime, and — the newest
// addition — automatically triggering an AI reply after messaging a bot
// company (see the `otherIsBot` check inside sendMessage, and
// api/bot-message-reply.ts on the server side).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { useFeatureFlags } from '@/lib/featureFlags';
import { uploadPrivateFile, openPrivateFile, timeAgo } from '@/lib/data';
import { Search, Send, Paperclip, Phone, Video, ArrowLeft, MessageSquare, X, Pencil, Check } from 'lucide-react';
import { ProfileCardModal } from '@/components/ProfileCardModal';
import { CompanyProfileCardModal } from '@/components/CompanyProfileCardModal';
import { QuizCard } from '@/components/QuizCard';
import type { Conversation, Message, Profile, CompanyProfile } from '@/lib/supabase';

// A `conversations` row only stores two raw participant IDs (user_a/
// user_b) — this extended shape adds everything the UI actually needs to
// DISPLAY that conversation (who the "other" person/company is, their
// name/avatar/role, and whether they're an AI bot), computed once when
// the list loads rather than looked up repeatedly while rendering.
type ConvWithOther = Conversation & { otherId: string; otherName: string; otherAvatar: string; otherRole: string; otherIsBot: boolean };

type Props = {
  onStartCall: (calleeId: string, callType: 'friend' | 'interview') => void;
  // These two work together to let ANOTHER page (e.g. "Message this
  // applicant" on ApplicantsView) tell this page "please open a
  // conversation with this specific person the moment you load" — see the
  // matching effect below.
  pendingOpenUserId?: string | null;
  onOpened?: () => void;
};

export function MessagesView({ onStartCall, pendingOpenUserId, onOpened }: Props) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const flags = useFeatureFlags();
  const callsEnabled = flags.calls !== false;
  const [conversations, setConversations] = useState<ConvWithOther[]>([]);
  const [activeConv, setActiveConv] = useState<ConvWithOther | null>(null); // which conversation is currently open in the right-hand thread panel
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null); // which student's ProfileCardModal is open, if any
  const [viewCompanyId, setViewCompanyId] = useState<string | null>(null); // which company's CompanyProfileCardModal is open, if any
  const [editingId, setEditingId] = useState<string | null>(null); // which message (if any) is currently being edited inline, Instagram-style
  const [editingText, setEditingText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // which message's delete confirmation popup (the app's own, not the browser's native confirm()) is open, if any
  const messagesEndRef = useRef<HTMLDivElement>(null); // an empty marker div at the bottom of the thread, used to auto-scroll to it
  const messageChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null); // the current realtime subscription, tracked so it can be swapped out when switching conversations

  // Loads every conversation this user is part of, enriched with the
  // OTHER participant's display info. This is more involved than a
  // typical `load` function because the "other person" could be either a
  // student (in `profiles`) OR a company (in `company_profiles`) — two
  // completely different tables — so it has to check both.
  const loadConversations = async () => {
    if (!user) return;
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      // A conversation row can have the current user as EITHER user_a or
      // user_b — `.or(...)` covers both possibilities in one query.
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order('last_message_at', { ascending: false }); // most recently active conversations first
    if (!convs) { setLoading(false); return; }

    // For each conversation, figure out which ID belongs to the OTHER person.
    const otherIds = convs.map((c: Conversation) => (c.user_a === user.id ? c.user_b : c.user_a));
    if (otherIds.length === 0) { setConversations([]); setLoading(false); return; }

    // Try to find all of them as STUDENT profiles first, in one batch query.
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .in('id', otherIds);
    const foundIds = new Set((profs || []).map((p: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role'>) => p.id));
    // Whichever IDs weren't found as students must be companies —
    // look those up separately.
    const missing = otherIds.filter((id: string) => !foundIds.has(id));

    let companyProfs: CompanyProfile[] = [];
    if (missing.length > 0) {
      const { data: cp } = await supabase.from('company_profiles').select('id, org_name, avatar_url, is_bot').in('id', missing);
      companyProfs = (cp as CompanyProfile[]) || [];
    }

    // Combine both sets of results into one lookup table (ID → display
    // info), so the next step can look up EITHER kind of participant the
    // same simple way.
    const profMap = new Map<string, { name: string; avatar: string; role: string; isBot: boolean }>();
    (profs || []).forEach((p: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role'>) => profMap.set(p.id, { name: p.full_name || 'User', avatar: p.avatar_url || '', role: p.role, isBot: false }));
    companyProfs.forEach((cp: CompanyProfile) => profMap.set(cp.id, { name: cp.org_name || 'Company', avatar: cp.avatar_url || '', role: 'company', isBot: cp.is_bot }));

    // Build the final enriched list.
    const enriched: ConvWithOther[] = convs.map((c: Conversation) => {
      const otherId = c.user_a === user.id ? c.user_b : c.user_a;
      const info = profMap.get(otherId) || { name: 'User', avatar: '', role: 'student', isBot: false };
      return { ...c, otherId, otherName: info.name, otherAvatar: info.avatar, otherRole: info.role, otherIsBot: info.isBot };
    });
    setConversations(enriched);
    setLoading(false);
  };

  // Loads every message in one conversation, oldest first, then scrolls
  // the thread down to the newest one after a brief delay (giving React
  // time to actually finish rendering the new messages before scrolling).
  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  // Subscribes to LIVE new messages in one specific conversation — this
  // is what makes a reply (whether from a real person in another tab, or
  // an AI bot replying a few seconds later) appear instantly without
  // needing to refresh or re-open the conversation.
  const subscribeToConv = (convId: string) => {
    // Always clean up any PREVIOUS conversation's subscription first —
    // otherwise switching between conversations would leave old
    // subscriptions running in the background forever, each one
    // needlessly reloading messages for a conversation that's no longer
    // even open.
    if (messageChannelRef.current) {
      try { supabase.removeChannel(messageChannelRef.current); } catch { /* ignore */ }
    }
    const ch = supabase
      .channel(`messages-${convId}`)
      // '*' (not just INSERT) so a message either side deletes disappears
      // live for both people, without needing to reopen the conversation.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, () => {
        loadMessages(convId);
      })
      .subscribe();
    messageChannelRef.current = ch;
  };

  // Marks every message in this conversation that was sent BY THE OTHER
  // PERSON (`neq('sender_id', user.id)`) and not yet read
  // (`is('read_at', null)`) as read now.
  const markRead = async (convId: string) => {
    if (!user) return;
    await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .neq('sender_id', user.id)
      .is('read_at', null);
  };

  // Switches the right-hand panel to show a specific (already-known)
  // conversation — loads its messages, marks them read, and starts
  // listening for live updates on it.
  const openConversation = (conv: ConvWithOther) => {
    setActiveConv(conv);
    loadMessages(conv.id);
    markRead(conv.id);
    subscribeToConv(conv.id);
  };

  // Opens (or creates, if none exists yet) a conversation with a
  // specific person by their user ID — used when arriving here from
  // "Message" buttons elsewhere in the app (a friend's profile, an
  // applicant's row, etc), rather than clicking an existing item in this
  // page's own conversation list.
  const openConversationWith = async (otherUserId: string, otherName: string) => {
    if (!user) return;
    // Conversation rows always store their two participant IDs in
    // alphabetically SORTED order (`[a, b] = [...].sort()`) — this
    // guarantees that looking up "the conversation between X and Y"
    // always finds the same row regardless of which of the two people
    // happens to be doing the looking-up. The exact same pattern is used
    // server-side in api/_lib/bots.ts's sendBotMessage and
    // src/lib/quiz.ts's sendQuizToStudent.
    const [a, b] = [user.id, otherUserId].sort();
    const { data: existing } = await supabase.from('conversations').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();
    let conv = existing as Conversation | null;
    if (!conv) {
      const { data: created } = await supabase.from('conversations').insert({ user_a: a, user_b: b }).select().maybeSingle();
      conv = created as Conversation | null;
    }
    if (conv) {
      // Build a minimal enriched object to open IMMEDIATELY (before the
      // full conversation list has necessarily reloaded) — note
      // `otherIsBot: false` is just a safe starting default here; if this
      // actually turns out to be a bot conversation, the follow-up
      // `loadConversations()` call below corrects it shortly after, once
      // the real company_profiles lookup completes.
      const enriched: ConvWithOther = {
        ...conv,
        otherId: otherUserId,
        otherName,
        otherAvatar: '',
        otherRole: 'student',
        otherIsBot: false,
      };
      loadConversations();
      openConversation(enriched);
    }
  };

  // If another page asked us (via the pendingOpenUserId prop) to open a
  // specific conversation the moment this page loads, do that once, then
  // tell the parent we've "consumed" the request (via onOpened) so it
  // doesn't keep re-triggering on every re-render.
  useEffect(() => {
    if (pendingOpenUserId) {
      openConversationWith(pendingOpenUserId, '');
      onOpened?.();
    }
  }, [pendingOpenUserId]);

  useEffect(() => {
    loadConversations();
    // Clean up the message-subscription channel if this whole page is
    // ever closed/navigated away from while a conversation is open.
    return () => {
      if (messageChannelRef.current) {
        try { supabase.removeChannel(messageChannelRef.current); } catch { /* ignore */ }
      }
    };
  }, [user]);

  // Deletes a message the current user sent. RLS also enforces
  // sender-only deletion server-side (see the delete_own_messages
  // policy), but the `.eq('sender_id', user.id)` here keeps the button
  // from ever showing an "it worked" toast for a request that was
  // actually silently rejected.
  //
  // The actual "are you sure" prompt lives in the JSX below as its own
  // styled popup (see confirmDeleteId) instead of the browser's native
  // `window.confirm()` — that native dialog is rendered entirely by the
  // browser chrome itself (it shows the site's raw URL as its title),
  // so it always looked out of place next to the rest of the app's UI.
  // This function now just performs the delete once that in-app popup
  // has already confirmed it.
  const deleteMessage = async (messageId: string) => {
    if (!user) return;
    const { error } = await supabase.from('messages').delete().eq('id', messageId).eq('sender_id', user.id);
    if (error) { showToast('Could not delete message', 'error'); return; }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    showToast('Message deleted', 'success');
  };

  // Starts inline editing on one of the current user's own messages.
  const startEditMessage = (m: Message) => {
    setEditingId(m.id);
    setEditingText(m.body);
  };

  const cancelEditMessage = () => {
    setEditingId(null);
    setEditingText('');
  };

  // Saves an edit to a message the current user sent. The
  // sender-only check happens server-side too (see the
  // prevent_message_content_edit_by_non_sender trigger), but the
  // `.eq('sender_id', user.id)` here keeps the UI from claiming success
  // on a request that was actually silently rejected.
  const saveEditMessage = async (messageId: string) => {
    if (!user) return;
    const trimmed = editingText.trim();
    if (!trimmed) { cancelEditMessage(); return; }
    const { error } = await supabase
      .from('messages')
      .update({ body: trimmed, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_id', user.id);
    if (error) { showToast('Could not edit message', 'error'); return; }
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, body: trimmed, edited_at: new Date().toISOString() } : m)));
    // Keep the conversation list preview in sync if this was the latest message.
    if (activeConv && messages[messages.length - 1]?.id === messageId) {
      await supabase.from('conversations').update({ last_message: trimmed }).eq('id', activeConv.id);
      loadConversations();
    }
    cancelEditMessage();
  };

  // Sends the current message (text and/or an attached file).
  const sendMessage = async () => {
    if (!input.trim() && !attachFile) return; // nothing to send
    if (!activeConv || !user) return;
    setSending(true);

    // If a file was attached, upload it FIRST — the message row itself
    // just stores a reference (path/name/type) to the already-uploaded file.
    let attachmentUrl = '';
    let attachmentName = '';
    let attachmentType = '';
    if (attachFile) {
      const path = await uploadPrivateFile('attachments', attachFile, user.id);
      if (path) {
        attachmentUrl = path;
        attachmentName = attachFile.name;
        attachmentType = attachFile.type;
      }
    }

    const body = input.trim();
    const { error } = await supabase.from('messages').insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      body,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      attachment_type: attachmentType,
    });

    if (!error) {
      // Update the conversation list preview text (falls back to a
      // paperclip + filename if there's an attachment but no typed text)
      // and bump the "last active" timestamp so this conversation moves
      // to the top of the list.
      await supabase.from('conversations').update({
        last_message: body || `📎 ${attachmentName}`,
        last_message_at: new Date().toISOString(),
      }).eq('id', activeConv.id);

      // Notify the recipient with a bell-icon notification.
      await supabase.from('notifications').insert({
        user_id: activeConv.otherId,
        type: 'message',
        title: `New message from ${profile?.full_name || 'someone'}`,
        body: body || `Sent an attachment: ${attachmentName}`,
        link_view: 'messages',
        link_id: activeConv.id,
      });
    }

    setInput('');
    setAttachFile(null);
    setSending(false);
    loadMessages(activeConv.id);
    loadConversations();

    // If we just messaged an AI bot company, trigger its reply.
    if (!error && activeConv.otherIsBot) {
      // Fire-and-forget: the bot's reply lands via the realtime subscription
      // already set up in subscribeToConv, so nothing here needs to block
      // the UI or await this response.
      supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        fetch('/api/bot-message-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ conversationId: activeConv.id }),
        }).catch(() => { /* best-effort — a missed bot reply isn't worth surfacing an error for */ });
      });
    }
  };

  // Simple client-side search of the already-loaded conversation list, by
  // the other participant's name.
  const filteredConvs = conversations.filter((c) =>
    c.otherName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-[var(--border)] glass">
      {/* ---------- Conversations list (left column) ---------- */}
      {/* On mobile, this list and the thread panel below are mutually
          exclusive — `activeConv ? 'hidden md:flex' : 'flex'` hides this
          whole sidebar once a conversation is open, showing only the
          thread (with a back button to return here). On desktop
          (`md:` prefix) both are always shown side by side. */}
      <aside className={`${activeConv ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-[var(--border)]`}>
        <div className="border-b border-[var(--border)] p-4">
          <span className="font-semibold text-[var(--text-primary)]">Conversations</span>
          <div className="search-field-wrap mt-3">
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="search-field"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin">
          {loading ? (
            <div className="space-y-2 p-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <MessageSquare size={24} className="text-[var(--text-muted)]" />
              <p className="text-xs text-[var(--text-muted)]">No conversations yet.</p>
            </div>
          ) : (
            filteredConvs.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c)}
                className={`flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition-colors ${
                  activeConv?.id === c.id ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]'
                }`}
              >
                {/* The avatar is its OWN clickable target (opening the
                    right profile/company popup), separate from the outer
                    button (which opens the conversation) —
                    `e.stopPropagation()` stops a click on the avatar from
                    ALSO triggering the outer button's onClick. */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (c.otherRole === 'company') setViewCompanyId(c.otherId);
                    else setViewProfileId(c.otherId);
                  }}
                  className="flex-shrink-0"
                >
                  {c.otherAvatar ? (
                    <img src={c.otherAvatar} alt="" className="h-10 w-10 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">
                      {c.otherName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.otherName}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{c.last_message || 'No messages yet'}</p>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{timeAgo(c.last_message_at)}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ---------- Thread (right column) ---------- */}
      <div className={`${activeConv ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {!activeConv ? (
          // Nothing selected yet — shown on desktop by default, and on
          // mobile only in the unlikely case this component somehow
          // renders with `activeConv` null while NOT showing the list
          // (which the CSS above otherwise prevents).
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageSquare size={40} className="text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)] max-w-xs">Select a conversation, or message someone from a company profile or applicant list.</p>
          </div>
        ) : (
          <>
            {/* ---------- Thread header ---------- */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile-only back button, returning to the conversation list. */}
                <button onClick={() => setActiveConv(null)} className="md:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <ArrowLeft size={20} />
                </button>
                <button
                  onClick={() => {
                    if (activeConv.otherRole === 'company') setViewCompanyId(activeConv.otherId);
                    else setViewProfileId(activeConv.otherId);
                  }}
                  className="flex items-center gap-3 min-w-0 text-left"
                >
                  {activeConv.otherAvatar ? (
                    <img src={activeConv.otherAvatar} alt="" className="h-10 w-10 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">
                      {activeConv.otherName.slice(0, 2).toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">{activeConv.otherName || 'User'}</p>
                    <p className="text-xs text-[var(--text-muted)]">Message</p>
                  </div>
                </button>
              </div>
              {/* Calling is hidden entirely if the admin's "calls"
                  feature flag is off. Note both buttons currently call
                  onStartCall with callType 'friend' regardless of
                  whether the other side is a company — the 'interview'
                  call type is only ever triggered from ApplicantsView.tsx's
                  dedicated Interview button, not from here. */}
              {callsEnabled && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onStartCall(activeConv.otherId, 'friend')}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)]"
                    title="Voice call"
                  >
                    <Phone size={16} />
                  </button>
                  <button
                    onClick={() => onStartCall(activeConv.otherId, 'friend')}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)]"
                    title="Video call"
                  >
                    <Video size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* ---------- Message bubbles ---------- */}
            <div className="flex-1 overflow-y-auto scroll-thin p-4 space-y-2">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-[var(--text-muted)]">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === user?.id;
                  const isEditing = editingId === m.id;
                  return (
                    <div key={m.id} className={`group flex items-center gap-1.5 ${isMine ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                      {/* Edit and delete are only ever offered on
                          messages the current user sent themselves —
                          matches the server-side sender-only
                          enforcement (delete_own_messages policy +
                          prevent_message_content_edit_by_non_sender
                          trigger). Hidden until hover so the thread
                          doesn't get visually noisy. Editing an
                          attachment-only message isn't offered — there's
                          no text to edit — and either action is hidden
                          while that same message is already being edited. */}
                      {isMine && !isEditing && (
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {!!m.body && (
                            <button
                              onClick={() => startEditMessage(m)}
                              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)]"
                              title="Edit message"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmDeleteId(m.id)}
                            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-400"
                            title="Delete message"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                      {isEditing ? (
                        // Inline edit mode: the bubble becomes a small
                        // form (Instagram-style) — Enter saves, Escape
                        // cancels, and there are explicit buttons too.
                        <div className="max-w-[75%] rounded-2xl bg-[var(--surface-hover)] border border-[var(--accent)] px-3 py-2">
                          <input
                            autoFocus
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); saveEditMessage(m.id); }
                              if (e.key === 'Escape') { e.preventDefault(); cancelEditMessage(); }
                            }}
                            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
                          />
                          <div className="mt-1.5 flex items-center justify-end gap-2">
                            <button onClick={cancelEditMessage} className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                              Cancel
                            </button>
                            <button onClick={() => saveEditMessage(m.id)} className="flex items-center gap-1 text-[10px] font-medium text-[var(--accent)] hover:opacity-80">
                              <Check size={11} /> Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            isMine
                              ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white rounded-br-md'
                              : 'bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]'
                          }`}
                        >
                          {m.body && <p className="text-sm">{m.body}</p>}
                          {/* A 'quiz' attachment renders as a full
                              interactive QuizCard (see QuizCard.tsx),
                              instead of the plain "download file" button
                              used for every other attachment type below. */}
                          {m.attachment_url && m.attachment_type === 'quiz' && (
                            <QuizCard assignmentId={m.attachment_url} isMine={isMine} />
                          )}
                          {m.attachment_url && m.attachment_type !== 'quiz' && (
                            <button
                              onClick={() => openPrivateFile('attachments', m.attachment_url)}
                              className="mt-1.5 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-xs hover:bg-black/30 transition-colors"
                            >
                              <Paperclip size={12} /> {m.attachment_name || 'Attachment'}
                            </button>
                          )}
                          <p className={`mt-0.5 text-[10px] ${isMine ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {m.edited_at && <span className="italic"> · edited</span>}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {/* An empty marker div at the very bottom of the thread —
                  `messagesEndRef.current?.scrollIntoView(...)` (called in
                  loadMessages above) scrolls to THIS element, which is
                  what makes the thread auto-scroll to the latest message. */}
              <div ref={messagesEndRef} />
            </div>

            {/* ---------- Input bar ---------- */}
            <div className="border-t border-[var(--border)] p-3">
              {/* A small preview chip showing the currently-attached
                  file (before sending), with a way to remove it. */}
              {attachFile && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-2 animate-slide-down">
                  <Paperclip size={14} className="text-[var(--accent)]" />
                  <span className="flex-1 truncate text-xs text-[var(--text-secondary)]">{attachFile.name}</span>
                  <button onClick={() => setAttachFile(null)} className="text-[var(--text-muted)] hover:text-rose-400">
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)] flex-shrink-0" title="Attach a file">
                  <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setAttachFile(f); }} />
                  <Paperclip size={18} />
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  // Enter sends the message; Shift+Enter is left free
                  // (not intercepted) for a potential future multi-line
                  // input — `e.preventDefault()` on plain Enter stops the
                  // browser from doing anything else with that keypress
                  // (this is a single-line <input>, so there's no
                  // newline behavior to worry about here anyway, but it's
                  // a safe habit).
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message…"
                  className="input-field flex-1"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || (!input.trim() && !attachFile)}
                  className="btn-primary h-10 w-10 !px-0 flex-shrink-0"
                  title="Send"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Clicking any avatar/name (in the list, or in the thread header)
          opens the matching popup — a student's ProfileCardModal or a
          company's CompanyProfileCardModal, whichever fits. */}
      {viewProfileId && (
        <ProfileCardModal
          userId={viewProfileId}
          onClose={() => setViewProfileId(null)}
          onCall={callsEnabled ? (id) => onStartCall(id, 'friend') : undefined}
        />
      )}
      {viewCompanyId && (
        <CompanyProfileCardModal companyId={viewCompanyId} onClose={() => setViewCompanyId(null)} />
      )}

      {/* The app's own delete-confirmation popup — replaces the browser's
          native window.confirm(), which rendered as an ugly OS-chrome
          dialog stamped with the site's raw URL instead of looking like
          part of the app. */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-5 shadow-xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[var(--text-primary)]">Delete this message?</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">This cannot be undone.</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="btn-ghost btn-sm">
                Cancel
              </button>
              <button
                onClick={() => { const id = confirmDeleteId; setConfirmDeleteId(null); deleteMessage(id); }}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-600"
              >
                <X size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
