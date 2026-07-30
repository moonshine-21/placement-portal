import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { uploadPrivateFile, openPrivateFile, timeAgo } from '@/lib/data';
import { Search, Send, Paperclip, Phone, Video, ArrowLeft, MessageSquare, X } from 'lucide-react';
import type { Conversation, Message, Profile, CompanyProfile } from '@/lib/supabase';

type ConvWithOther = Conversation & { otherId: string; otherName: string; otherAvatar: string; otherRole: string };

type Props = {
  onStartCall: (calleeId: string, callType: 'friend' | 'interview') => void;
  pendingOpenUserId?: string | null;
  onOpened?: () => void;
};

export function MessagesView({ onStartCall, pendingOpenUserId, onOpened }: Props) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<ConvWithOther[]>([]);
  const [activeConv, setActiveConv] = useState<ConvWithOther | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadConversations = async () => {
    if (!user) return;
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order('last_message_at', { ascending: false });
    if (!convs) { setLoading(false); return; }

    const otherIds = convs.map((c: Conversation) => (c.user_a === user.id ? c.user_b : c.user_a));
    if (otherIds.length === 0) { setConversations([]); setLoading(false); return; }

    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .in('id', otherIds);
    const foundIds = new Set((profs || []).map((p: Profile) => p.id));
    const missing = otherIds.filter((id: string) => !foundIds.has(id));

    let companyProfs: CompanyProfile[] = [];
    if (missing.length > 0) {
      const { data: cp } = await supabase.from('company_profiles').select('*').in('id', missing);
      companyProfs = (cp as CompanyProfile[]) || [];
    }

    const profMap = new Map<string, { name: string; avatar: string; role: string }>();
    (profs || []).forEach((p: Profile) => profMap.set(p.id, { name: p.full_name || 'User', avatar: p.avatar_url || '', role: p.role }));
    companyProfs.forEach((cp: CompanyProfile) => profMap.set(cp.id, { name: cp.org_name || 'Company', avatar: cp.avatar_url || '', role: 'company' }));

    const enriched: ConvWithOther[] = convs.map((c: Conversation) => {
      const otherId = c.user_a === user.id ? c.user_b : c.user_a;
      const info = profMap.get(otherId) || { name: 'User', avatar: '', role: 'student' };
      return { ...c, otherId, otherName: info.name, otherAvatar: info.avatar, otherRole: info.role };
    });
    setConversations(enriched);
    setLoading(false);
  };

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const subscribeToConv = (convId: string) => {
    if (messageChannelRef.current) {
      try { supabase.removeChannel(messageChannelRef.current); } catch { /* ignore */ }
    }
    const ch = supabase
      .channel(`messages-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, () => {
        loadMessages(convId);
      })
      .subscribe();
    messageChannelRef.current = ch;
  };

  const markRead = async (convId: string) => {
    if (!user) return;
    await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .neq('sender_id', user.id)
      .is('read_at', null);
  };

  const openConversation = (conv: ConvWithOther) => {
    setActiveConv(conv);
    loadMessages(conv.id);
    markRead(conv.id);
    subscribeToConv(conv.id);
  };

  const openConversationWith = async (otherUserId: string, otherName: string) => {
    if (!user) return;
    const [a, b] = [user.id, otherUserId].sort();
    const { data: existing } = await supabase.from('conversations').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();
    let conv = existing as Conversation | null;
    if (!conv) {
      const { data: created } = await supabase.from('conversations').insert({ user_a: a, user_b: b }).select().maybeSingle();
      conv = created as Conversation | null;
    }
    if (conv) {
      const enriched: ConvWithOther = {
        ...conv,
        otherId: otherUserId,
        otherName,
        otherAvatar: '',
        otherRole: 'student',
      };
      loadConversations();
      openConversation(enriched);
    }
  };

  useEffect(() => {
    if (pendingOpenUserId) {
      openConversationWith(pendingOpenUserId, '');
      onOpened?.();
    }
  }, [pendingOpenUserId]);

  useEffect(() => {
    loadConversations();
    return () => {
      if (messageChannelRef.current) {
        try { supabase.removeChannel(messageChannelRef.current); } catch { /* ignore */ }
      }
    };
  }, [user]);

  const sendMessage = async () => {
    if (!input.trim() && !attachFile) return;
    if (!activeConv || !user) return;
    setSending(true);

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
      await supabase.from('conversations').update({
        last_message: body || `📎 ${attachmentName}`,
        last_message_at: new Date().toISOString(),
      }).eq('id', activeConv.id);

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
  };

  const filteredConvs = conversations.filter((c) =>
    c.otherName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-[var(--border)] glass">
      {/* Conversations list */}
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
                {c.otherAvatar ? (
                  <img src={c.otherAvatar} alt="" className="h-10 w-10 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white flex-shrink-0">
                    {c.otherName.slice(0, 2).toUpperCase()}
                  </div>
                )}
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

      {/* Thread */}
      <div className={`${activeConv ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {!activeConv ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageSquare size={40} className="text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)] max-w-xs">Select a conversation, or message someone from a company profile or applicant list.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setActiveConv(null)} className="md:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <ArrowLeft size={20} />
                </button>
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
              </div>
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
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scroll-thin p-4 space-y-2">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-[var(--text-muted)]">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          isMine
                            ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white rounded-br-md'
                            : 'bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]'
                        }`}
                      >
                        {m.body && <p className="text-sm">{m.body}</p>}
                        {m.attachment_url && (
                          <button
                            onClick={() => openPrivateFile('attachments', m.attachment_url)}
                            className="mt-1.5 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-xs hover:bg-black/30 transition-colors"
                          >
                            <Paperclip size={12} /> {m.attachment_name || 'Attachment'}
                          </button>
                        )}
                        <p className={`mt-0.5 text-[10px] ${isMine ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border)] p-3">
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
    </div>
  );
}
