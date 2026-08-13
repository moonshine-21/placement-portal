// ============================================================================
// src/views/AnnouncementsView.tsx
//
// WHAT THIS FILE IS: a shared bulletin-board page — companies (and admins)
// can post announcements with a priority level; every student sees the
// same list, read-only. This single component is reused for BOTH the
// student view and the company view (see the `isCompany` prop, passed as
// `true` from App.tsx only on the 'company-announcements' route) — rather
// than maintaining two separate near-identical files.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/data';
import { Megaphone, Plus, X, Trash2, AlertCircle, Info, Zap } from 'lucide-react';
import type { Announcement } from '@/lib/supabase';
import { AdminBadge } from '@/components/AdminBadge';
import { Select } from '@/components/Select';

// A lookup table describing each priority level's label, icon, and color
// — one central place to change how a priority is displayed everywhere it
// appears on this page.
const PRIORITY_META = {
  normal: { label: 'Normal', icon: Info, color: '#38bdf8' },
  important: { label: 'Important', icon: AlertCircle, color: '#fbbf24' },
  urgent: { label: 'Urgent', icon: Zap, color: '#fb7185' },
};

type Props = {
  isCompany?: boolean; // passed by App.tsx to distinguish the 'company-announcements' route from the plain student 'announcements' route
};

export function AnnouncementsView({ isCompany }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);

  // Who's allowed to POST (not just view) an announcement: either this
  // page was explicitly opened via the company route, OR the logged-in
  // account's role is 'company' or 'admin' — covers both ways someone
  // could legitimately be here with posting rights.
  const canPost = isCompany || profile?.role === 'company' || profile?.role === 'admin';

  const load = async () => {
    // No `.eq(...)` filter here at all — every visitor sees every
    // announcement, regardless of role; only the ABILITY TO POST differs.
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    setAnnouncements((data as Announcement[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canPost) {
      // Defensive check — the Post button is already hidden for anyone
      // without permission, but this guards against the form somehow
      // being submitted anyway (e.g. pressing Enter in a field).
      showToast('Only companies can post announcements', 'error');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('announcements').insert({
      title,
      body,
      priority,
      author_id: profile.id,
      author_name: profile.full_name || profile.email,
      author_role: profile.role,
    });
    setSaving(false);
    if (error) { showToast('Could not post: ' + error.message, 'error'); return; }
    showToast('Announcement posted!', 'success');
    setShowForm(false);
    setTitle(''); setBody(''); setPriority('normal');
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    showToast('Deleted', 'info');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone size={20} className="text-[var(--accent)]" />
          <h2 className="text-lg font-semibold">Announcements</h2>
        </div>
        {/* The "Post Announcement" button only exists for people allowed
            to post — students viewing this page simply never see it. */}
        {canPost && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm">
            <Plus size={14} /> Post Announcement
          </button>
        )}
      </div>

      {!canPost && (
        <p className="text-xs text-[var(--text-muted)]">
          Announcements are posted by companies. Students can view them here.
        </p>
      )}

      {showForm && canPost && (
        <form onSubmit={create} className="card space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">New Announcement</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Placement season starts next week" className="input-field" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} placeholder="Write your announcement…" className="input-field" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Priority</label>
            {/* Turns PRIORITY_META's keys/labels into the { value, label }
                option list the Select component expects. */}
            <Select value={priority} onChange={setPriority} options={Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.label }))} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Posting…' : 'Post Announcement'}</button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : announcements.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <Megaphone size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a, i) => {
            // `as keyof typeof PRIORITY_META` tells TypeScript "trust
            // this string to be one of PRIORITY_META's actual keys" —
            // needed because `a.priority` comes from the database as a
            // plain generic `string`, which TypeScript can't otherwise
            // guarantee matches one of our three specific priority names.
            // The `|| PRIORITY_META.normal` fallback handles it gracefully
            // even if it somehow doesn't.
            const meta = PRIORITY_META[a.priority as keyof typeof PRIORITY_META] || PRIORITY_META.normal;
            const Icon = meta.icon;
            const isOwner = profile?.id === a.author_id;
            return (
              <div key={a.id} className="card animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0" style={{ background: `${meta.color}20`, color: meta.color }}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{a.title}</h3>
                      <span className="rounded-md px-2 py-0.5 text-[10px] font-medium" style={{ background: `${meta.color}20`, color: meta.color }}>{meta.label}</span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{a.body}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-2 flex items-center gap-1.5 flex-wrap">
                      <span>{a.author_name}</span>
                      {(a.author_role === 'admin' || a.author_role === 'owner') && <AdminBadge role={a.author_role} />}
                      <span>· {timeAgo(a.created_at)}</span>
                    </p>
                  </div>
                  {/* Delete button only shown to whoever originally
                      posted this specific announcement — not to every
                      company/admin, and never to students. */}
                  {isOwner && canPost && (
                    <button onClick={() => remove(a.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
