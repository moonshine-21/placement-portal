import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/data';
import { MessageCircle, Plus, X, ArrowLeft, Send, Trash2, Eye } from 'lucide-react';
import type { ForumPost, ForumReply } from '@/lib/supabase';
import { AdminBadge } from '@/components/AdminBadge';

const CATEGORIES = [
  { key: 'general', label: 'General', color: '#94a3b8' },
  { key: 'placements', label: 'Placements', color: '#38bdf8' },
  { key: 'skills', label: 'Skills', color: '#34d399' },
  { key: 'career', label: 'Career', color: '#fbbf24' },
];

export function ForumView() {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [filter, setFilter] = useState('all');

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);

  const loadPosts = async () => {
    let q = supabase.from('forum_posts').select('*').order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('category', filter);
    const { data } = await q;
    setPosts((data as ForumPost[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadPosts(); }, [filter]);

  const createPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('forum_posts').insert({
      author_id: user.id, author_name: profile?.full_name || profile?.email || 'User',
      author_role: profile?.role || '',
      title, body, category,
    });
    setSaving(false);
    if (error) { showToast('Could not post: ' + error.message, 'error'); return; }
    showToast('Posted to forum!', 'success');
    setShowForm(false);
    setTitle(''); setBody(''); setCategory('general');
    loadPosts();
  };

  const openPost = async (p: ForumPost) => {
    setSelectedPost(p);
    await supabase.from('forum_posts').update({ views: p.views + 1 }).eq('id', p.id);
    const { data } = await supabase.from('forum_replies').select('*').eq('post_id', p.id).order('created_at', { ascending: true });
    setReplies((data as ForumReply[]) || []);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !user || !selectedPost) return;
    const { data, error } = await supabase.from('forum_replies').insert({
      post_id: selectedPost.id, author_id: user.id,
      author_name: profile?.full_name || profile?.email || 'User',
      author_role: profile?.role || '',
      body: replyText.trim(),
    }).select().maybeSingle();
    if (error) { showToast('Could not reply: ' + error.message, 'error'); return; }
    if (data) setReplies([...replies, data as ForumReply]);
    setReplyText('');
  };

  const deletePost = async (id: string) => {
    if (!confirm('Delete this post and all replies?')) return;
    await supabase.from('forum_posts').delete().eq('id', id);
    showToast('Post deleted', 'info');
    setSelectedPost(null);
    loadPosts();
  };

  const deleteReply = async (id: string) => {
    await supabase.from('forum_replies').delete().eq('id', id);
    setReplies(replies.filter(r => r.id !== id));
  };

  const catMeta = (c: string) => CATEGORIES.find(x => x.key === c) || CATEGORIES[0];

  if (selectedPost) {
    const meta = catMeta(selectedPost.category);
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedPost(null)} className="btn-ghost btn-sm"><ArrowLeft size={14} /> Back to Forum</button>
        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{selectedPost.title}</h2>
                <span className="rounded-md px-2 py-0.5 text-[10px] font-medium" style={{ background: `${meta.color}20`, color: meta.color }}>{meta.label}</span>
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-1 flex items-center gap-1.5 flex-wrap">
                <span>{selectedPost.author_name}</span>
                {(selectedPost.author_role === 'admin' || selectedPost.author_role === 'owner') && <AdminBadge role={selectedPost.author_role} />}
                <span>· {timeAgo(selectedPost.created_at)} · {selectedPost.views} views</span>
              </p>
            </div>
            {profile?.id === selectedPost.author_id && (
              <button onClick={() => deletePost(selectedPost.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 flex-shrink-0"><Trash2 size={14} /></button>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-4 whitespace-pre-wrap">{selectedPost.body}</p>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Replies ({replies.length})</h3>
          {replies.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">No replies yet. Be the first to respond!</p>
          ) : (
            <div className="space-y-3">
              {replies.map(r => (
                <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {r.author_name}
                      {(r.author_role === 'admin' || r.author_role === 'owner') && <AdminBadge role={r.author_role} />}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">{timeAgo(r.created_at)}</span>
                      {profile?.id === r.author_id && <button onClick={() => deleteReply(r.id)} className="text-[var(--text-muted)] hover:text-rose-400"><Trash2 size={12} /></button>}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">{r.body}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }} placeholder="Write a reply…" className="input-field flex-1" />
            <button onClick={sendReply} disabled={!replyText.trim()} className="btn-primary h-10 w-10 !px-0 flex-shrink-0"><Send size={18} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle size={20} className="text-[var(--accent)]" />
          <h2 className="text-lg font-semibold">Community Forum</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm"><Plus size={14} /> New Post</button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setFilter('all')} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${filter === 'all' ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${filter === c.key ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-white' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{c.label}</button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={createPost} className="card space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">New Forum Post</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
          </div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. How to prepare for Nimbus Labs interview?" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Body</label><textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} placeholder="Share your question or advice…" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Category</label><select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Posting…' : 'Post to Forum'}</button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : posts.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <MessageCircle size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No posts yet. Start a discussion!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p, i) => {
            const meta = catMeta(p.category);
            return (
              <button key={p.id} onClick={() => openPost(p)} className="card card-hover w-full text-left animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{p.title}</h3>
                      <span className="rounded-md px-2 py-0.5 text-[10px] font-medium" style={{ background: `${meta.color}20`, color: meta.color }}>{meta.label}</span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">{p.body}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)] flex-wrap">
                      <span className="flex items-center gap-1.5">
                        {p.author_name}
                        {(p.author_role === 'admin' || p.author_role === 'owner') && <AdminBadge role={p.author_role} />}
                      </span>
                      <span>{timeAgo(p.created_at)}</span>
                      <span className="flex items-center gap-1"><Eye size={12} /> {p.views}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
