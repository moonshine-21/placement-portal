import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, AuditLogEntry, Announcement, Job, Event as EventT, ForumPost } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { logAdminAction } from '@/lib/audit';
import { Select } from '@/components/Select';
import { Portal } from '@/components/Portal';
import { timeAgo } from '@/lib/data';
import {
  Users, ShieldAlert, ScrollText, Search, X, Ban, ShieldCheck, Save,
  Briefcase, GraduationCap, Building2, UserCog, AlertTriangle, Ghost,
  Megaphone, Calendar, MessageCircle, Trash2, Filter,
} from 'lucide-react';

/* ---------------------------------------------------------------------- */
/* Dashboard                                                               */
/* ---------------------------------------------------------------------- */

export function AdminDashboardView() {
  const [stats, setStats] = useState({
    students: 0, companies: 0, admins: 0, banned: 0,
    jobs: 0, applications: 0, announcements: 0, forumPosts: 0,
  });
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [profiles, jobs, apps, ann, posts, logs] = await Promise.all([
        supabase.from('profiles').select('role, is_banned'),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
        supabase.from('company_applications').select('id', { count: 'exact', head: true }),
        supabase.from('announcements').select('id', { count: 'exact', head: true }),
        supabase.from('forum_posts').select('id', { count: 'exact', head: true }),
        supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(6),
      ]);

      const rows = (profiles.data as { role: string; is_banned: boolean }[]) || [];
      setStats({
        students: rows.filter((r) => r.role === 'student').length,
        companies: rows.filter((r) => r.role === 'company').length,
        admins: rows.filter((r) => r.role === 'admin').length,
        banned: rows.filter((r) => r.is_banned).length,
        jobs: jobs.count || 0,
        applications: apps.count || 0,
        announcements: ann.count || 0,
        forumPosts: posts.count || 0,
      });
      setRecentLogs((logs.data as AuditLogEntry[]) || []);
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: 'Students', value: stats.students, icon: GraduationCap, color: '#38bdf8' },
    { label: 'Companies', value: stats.companies, icon: Building2, color: '#a78bfa' },
    { label: 'Admins', value: stats.admins, icon: UserCog, color: '#34d399' },
    { label: 'Banned Accounts', value: stats.banned, icon: Ban, color: '#fb7185' },
    { label: 'Open Jobs', value: stats.jobs, icon: Briefcase, color: '#fbbf24' },
    { label: 'Applications', value: stats.applications, icon: ScrollText, color: '#60a5fa' },
    { label: 'Announcements', value: stats.announcements, icon: Megaphone, color: '#f472b6' },
    { label: 'Forum Posts', value: stats.forumPosts, icon: MessageCircle, color: '#4ade80' },
  ];

  if (loading) return <div className="typing-dots"><span></span><span></span><span></span></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-medium uppercase tracking-wide">
              <c.icon size={14} style={{ color: c.color }} />
              {c.label}
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ScrollText size={16} className="text-[var(--accent)]" />
          <h3 className="font-semibold text-[var(--text-primary)]">Recent Admin Activity</h3>
        </div>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No admin actions logged yet.</p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-[var(--text-primary)]">{log.actor_name}</span>
                  <span className="text-[var(--text-muted)]"> {log.action} </span>
                  <span className="text-[var(--text-secondary)] truncate">{log.target_label}</span>
                </div>
                <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">{timeAgo(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* User management                                                         */
/* ---------------------------------------------------------------------- */

export function AdminUsersView() {
  const { profile: adminProfile } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'company' | 'admin' | 'owner'>('all');
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers((data as Profile[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="input-field pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'student', 'company', 'admin', 'owner'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                roleFilter === r
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="typing-dots"><span></span><span></span><span></span></div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-muted)]">No users found.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="max-h-[65vh] overflow-y-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">{u.full_name || 'Unnamed'}</div>
                      <div className="text-xs text-[var(--text-muted)]">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{u.role}</td>
                    <td className="px-4 py-3">
                      {u.is_banned ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400">
                          <Ban size={11} /> Banned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          <ShieldCheck size={11} /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{timeAgo(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditing(u)} className="btn-secondary btn-sm">Manage</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <EditUserModal
          user={editing}
          adminId={adminProfile?.id || ''}
          adminName={adminProfile?.full_name || adminProfile?.email || 'Admin'}
          adminRole={adminProfile?.role || 'admin'}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function EditUserModal({
  user, adminId, adminName, adminRole, onClose, onSaved, showToast,
}: {
  user: Profile;
  adminId: string;
  adminName: string;
  adminRole: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const isOwner = adminRole === 'owner';
  const targetIsOwner = user.role === 'owner';
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    email: user.email || '',
    role: user.role,
    branch: user.branch || '',
    cgpa: user.cgpa ?? 0,
    bio: user.bio || '',
  });
  const [banReason, setBanReason] = useState(user.ban_reason || '');
  const [saving, setSaving] = useState(false);
  const [confirmBan, setConfirmBan] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      role: form.role,
      branch: form.branch,
      cgpa: form.cgpa,
      bio: form.bio,
    }).eq('id', user.id);
    setSaving(false);
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    await logAdminAction({
      actorId: adminId, actorName: adminName, action: 'edited profile',
      targetType: 'profile', targetId: user.id, targetLabel: form.full_name || user.email,
      details: { before: { full_name: user.full_name, role: user.role }, after: form },
    });
    showToast('Profile updated', 'success');
    onSaved();
  };

  const toggleBan = async () => {
    const nextBanned = !user.is_banned;
    if (nextBanned && !confirmBan) { setConfirmBan(true); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      is_banned: nextBanned,
      ban_reason: nextBanned ? banReason : '',
      banned_at: nextBanned ? new Date().toISOString() : null,
      banned_by: nextBanned ? adminId : null,
    }).eq('id', user.id);
    setSaving(false);
    if (error) { showToast('Action failed: ' + error.message, 'error'); return; }
    await logAdminAction({
      actorId: adminId, actorName: adminName,
      action: nextBanned ? 'banned account' : 'unbanned account',
      targetType: 'profile', targetId: user.id, targetLabel: user.full_name || user.email,
      details: nextBanned ? { reason: banReason } : {},
    });
    showToast(nextBanned ? 'Account banned' : 'Account unbanned', nextBanned ? 'info' : 'success');
    onSaved();
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto scroll-thin p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Manage User</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Full Name</label>
            <input className="input-field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Email (read-only)</label>
            <input className="input-field opacity-60" value={form.email} disabled />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Role</label>
              {isOwner ? (
                <Select
                  value={form.role}
                  onChange={(v) => setForm({ ...form, role: v as Profile['role'] })}
                  options={[
                    { value: 'student', label: 'Student' },
                    { value: 'company', label: 'Company' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'owner', label: 'Owner' },
                  ]}
                />
              ) : (
                <div className="input-field flex items-center opacity-70 capitalize">
                  {form.role}
                  <span className="ml-auto text-[10px] normal-case text-[var(--text-muted)]">Only owners can change roles</span>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Branch</label>
              <input className="input-field" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">CGPA</label>
            <input type="number" step="0.01" className="input-field" value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Bio</label>
            <textarea className="input-field" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>

          <button onClick={save} disabled={saving} className="btn-primary w-full">
            <Save size={14} /> Save Changes
          </button>

          {(!targetIsOwner || isOwner) && (
          <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-400">
              <ShieldAlert size={16} /> Danger Zone
            </div>
            {user.is_banned ? (
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                Banned {user.banned_at ? timeAgo(user.banned_at) : ''}{user.ban_reason ? ` — reason: ${user.ban_reason}` : ''}
              </p>
            ) : confirmBan ? (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Reason for ban</label>
                <input className="input-field" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="e.g. Fake profile / policy violation" />
              </div>
            ) : null}
            <div className="flex gap-2">
              <button
                onClick={toggleBan}
                disabled={saving}
                className={`btn-sm flex-1 ${user.is_banned ? 'btn-secondary' : 'bg-rose-500 hover:bg-rose-600 text-white rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2'}`}
              >
                <Ban size={14} /> {user.is_banned ? 'Unban Account' : confirmBan ? 'Confirm Ban' : 'Ban Account'}
              </button>
              {confirmBan && !user.is_banned && (
                <button onClick={() => setConfirmBan(false)} className="btn-secondary btn-sm">Cancel</button>
              )}
            </div>
          </div>
          )}
          {targetIsOwner && !isOwner && (
            <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
              This account is an owner — only another owner can ban or change it.
            </p>
          )}
        </div>
      </div>
      </div>
    </Portal>
  );
}

/* ---------------------------------------------------------------------- */
/* Audit logs                                                              */
/* ---------------------------------------------------------------------- */

export function AdminLogsView() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(300);
      setLogs((data as AuditLogEntry[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = logs.filter((l) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return l.actor_name?.toLowerCase().includes(s) || l.action?.toLowerCase().includes(s) || l.target_label?.toLowerCase().includes(s);
  });

  if (loading) return <div className="typing-dots"><span></span><span></span><span></span></div>;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter logs..." className="input-field pl-9" />
      </div>
      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-muted)]">
          <Ghost size={28} className="mx-auto mb-2 opacity-40" />
          No matching activity.
        </div>
      ) : (
        <div className="card divide-y divide-[var(--border)]">
          {filtered.map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--surface-hover)]">
                <UserCog size={14} className="text-[var(--accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-primary)]">
                  <span className="font-semibold">{log.actor_name}</span>{' '}
                  <span className="text-[var(--text-secondary)]">{log.action}</span>{' '}
                  {log.target_label && <span className="font-medium">{log.target_label}</span>}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{log.target_type} · {timeAgo(log.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Content moderation                                                      */
/* ---------------------------------------------------------------------- */

type ContentTab = 'jobs' | 'announcements' | 'events' | 'forum';

export function AdminContentView() {
  const { profile: adminProfile } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<ContentTab>('announcements');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventT[]>([]);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [j, a, e, p] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('forum_posts').select('*').order('created_at', { ascending: false }),
    ]);
    setJobs((j.data as Job[]) || []);
    setAnnouncements((a.data as Announcement[]) || []);
    setEvents((e.data as EventT[]) || []);
    setPosts((p.data as ForumPost[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (table: string, id: string, label: string, targetType: string) => {
    if (!confirm(`Remove "${label}"? This cannot be undone.`)) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    await logAdminAction({
      actorId: adminProfile?.id || '', actorName: adminProfile?.full_name || adminProfile?.email || 'Admin',
      action: 'removed', targetType, targetId: id, targetLabel: label,
    });
    showToast('Removed', 'info');
    load();
  };

  const tabs: { key: ContentTab; label: string; icon: typeof Briefcase }[] = [
    { key: 'announcements', label: 'Announcements', icon: Megaphone },
    { key: 'jobs', label: 'Jobs', icon: Briefcase },
    { key: 'events', label: 'Events', icon: Calendar },
    { key: 'forum', label: 'Forum Posts', icon: MessageCircle },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              tab === t.key ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="typing-dots"><span></span><span></span><span></span></div>
      ) : (
        <div className="card divide-y divide-[var(--border)]">
          {tab === 'announcements' && announcements.map((a) => (
            <Row key={a.id} title={a.title} sub={`${a.author_name} · ${timeAgo(a.created_at)}`} onDelete={() => remove('announcements', a.id, a.title, 'announcement')} />
          ))}
          {tab === 'jobs' && jobs.map((j) => (
            <Row key={j.id} title={j.job_name} sub={`${j.role} · ${j.status} · ${timeAgo(j.created_at)}`} onDelete={() => remove('jobs', j.id, j.job_name, 'job')} />
          ))}
          {tab === 'events' && events.map((e) => (
            <Row key={e.id} title={e.title} sub={`${e.event_type} · ${timeAgo(e.created_at)}`} onDelete={() => remove('events', e.id, e.title, 'event')} />
          ))}
          {tab === 'forum' && posts.map((p) => (
            <Row key={p.id} title={p.title} sub={`${p.author_name} · ${timeAgo(p.created_at)}`} onDelete={() => remove('forum_posts', p.id, p.title, 'forum post')} />
          ))}
          {(tab === 'announcements' ? announcements : tab === 'jobs' ? jobs : tab === 'events' ? events : posts).length === 0 && (
            <div className="p-8 text-center text-[var(--text-muted)]">
              <Filter size={24} className="mx-auto mb-2 opacity-40" /> Nothing here.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ title, sub, onDelete }: { title: string; sub: string; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-muted)]">{sub}</p>
      </div>
      <button onClick={onDelete} className="flex-shrink-0 rounded-lg p-2 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-400">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export const AdminIcons = { Users, ShieldAlert, ScrollText, AlertTriangle };
