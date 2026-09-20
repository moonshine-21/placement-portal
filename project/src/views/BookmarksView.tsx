// ============================================================================
// src/views/BookmarksView.tsx
//
// WHAT THIS FILE IS: the "saved companies" page for students — a simple
// list of every CompanyProfile they've bookmarked while browsing (see the
// bookmark button in CompaniesBrowseView.tsx), with a remove option.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Bookmark, Building2, Send, Trash2, ArrowRight } from 'lucide-react';
import type { Bookmark as BookmarkType, CompanyProfile } from '@/lib/supabase';

// `onNavigate` lets this page's "Browse Companies" button jump straight
// to the Companies tab — passed down from App.tsx's router.
type Props = {
  onNavigate: (view: string) => void;
};

export function BookmarksView({ onNavigate }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  // Each bookmark, enriched with the FULL company profile it points to
  // (the raw `bookmarks` table only stores a company_id, not the
  // company's name/logo/etc — see `load()` below for how these get joined).
  const [bookmarks, setBookmarks] = useState<(BookmarkType & { company?: CompanyProfile })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    // Step 1: get this student's raw bookmark rows.
    const { data } = await supabase.from('bookmarks').select('*').eq('student_id', user.id).order('created_at', { ascending: false });
    const bms = (data as BookmarkType[]) || [];
    if (bms.length === 0) { setBookmarks([]); setLoading(false); return; }

    // Step 2: fetch every one of those companies' full profiles in ONE
    // query (`.in('id', companyIds)`), rather than one separate query per
    // bookmark — much more efficient.
    const companyIds = bms.map(b => b.company_id);
    const { data: companies } = await supabase.from('company_profiles').select('*').in('id', companyIds);

    // Build a quick lookup table (company ID → full company data), so
    // step 3 below can attach the right company to each bookmark without
    // searching through the whole list each time.
    const companyMap = new Map<string, CompanyProfile>();
    (companies as CompanyProfile[] || []).forEach(c => companyMap.set(c.id, c));

    // Step 3: combine each bookmark with its matching company data.
    setBookmarks(bms.map(b => ({ ...b, company: companyMap.get(b.company_id) })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // Deletes one bookmark and refreshes the list.
  const remove = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id);
    showToast('Bookmark removed', 'info');
    load();
  };

  // Loading skeleton — three pulsing gray boxes roughly matching the
  // eventual card layout.
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-40 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Bookmark size={20} className="text-[var(--accent)]" />
        <h2 className="text-lg font-semibold">Bookmarked Companies</h2>
        <span className="text-sm text-[var(--text-muted)]">({bookmarks.length})</span>
      </div>

      {bookmarks.length === 0 ? (
        // Empty state — friendly message + a shortcut button to go find
        // some companies to bookmark, rather than just a blank page.
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
            // Defensive check: if the bookmarked company was somehow
            // deleted from the database, `c` would be undefined here —
            // skip rendering a broken card for it rather than crashing.
            if (!c) return null;
            return (
              // Each card fades in with a slightly increasing delay
              // (`i * 0.05s`), creating a subtle staggered entrance
              // animation across the whole grid rather than everything
              // popping in at once.
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
                {/* `line-clamp-2` truncates a long description to 2 lines
                    with a "..." rather than letting it stretch the card. */}
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
