import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Bookmark, Building2, Send, Trash2, ArrowRight } from 'lucide-react';
import type { Bookmark as BookmarkType, CompanyProfile } from '@/lib/supabase';

type Props = {
  onNavigate: (view: string) => void;
};

export function BookmarksView({ onNavigate }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [bookmarks, setBookmarks] = useState<(BookmarkType & { company?: CompanyProfile })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('bookmarks').select('*').eq('student_id', user.id).order('created_at', { ascending: false });
    const bms = (data as BookmarkType[]) || [];
    if (bms.length === 0) { setBookmarks([]); setLoading(false); return; }
    const companyIds = bms.map(b => b.company_id);
    const { data: companies } = await supabase.from('company_profiles').select('*').in('id', companyIds);
    const companyMap = new Map<string, CompanyProfile>();
    (companies as CompanyProfile[] || []).forEach(c => companyMap.set(c.id, c));
    setBookmarks(bms.map(b => ({ ...b, company: companyMap.get(b.company_id) })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const remove = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id);
    showToast('Bookmark removed', 'info');
    load();
  };

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-40 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Bookmark size={20} className="text-[var(--accent)]" />
        <h2 className="text-lg font-semibold">Bookmarked Companies</h2>
        <span className="text-sm text-[var(--text-muted)]">({bookmarks.length})</span>
      </div>

      {bookmarks.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <Bookmark size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No bookmarks yet. Save companies from the Companies page to find them here.</p>
          <button onClick={() => onNavigate('companies')} className="btn-primary btn-sm">
            Browse Companies <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bookmarks.map((b, i) => {
            const c = b.company;
            if (!c) return null;
            return (
              <div key={b.id} className="card card-hover animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-start gap-3">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-12 w-12 rounded-xl object-cover" /> : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-sm font-bold text-white">{(c.org_name || 'CO').slice(0, 2).toUpperCase()}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{c.org_name}</h3>
                    <p className="text-xs text-[var(--text-muted)] truncate">{c.industry || '—'}</p>
                  </div>
                  <button onClick={() => remove(b.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
                {c.about_us && <p className="text-xs text-[var(--text-secondary)] mt-3 line-clamp-2">{c.about_us}</p>}
                <button onClick={() => onNavigate('companies')} className="btn-ghost btn-sm w-full mt-3">
                  <Building2 size={14} /> View Profile
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
