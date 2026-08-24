// ============================================================================
// src/components/AppShell.tsx
//
// WHAT THIS FILE IS: the surrounding "frame" of the entire logged-in app
// — the left glass sidebar navigation (Discord-style: icon bubbles, active
// indicator bar, user panel pinned to the bottom), the top header bar
// (page title, theme switcher, notifications bell), and the content area
// where whichever page App.tsx picked gets placed (`{children}`). Every
// single view in src/views/ gets wrapped in this same shell, so
// navigation always looks and behaves consistently no matter which page
// you're on.
//
// ANTI-FLICKER NOTE: `SidebarNav` below is its own `memo`-wrapped
// component so parent re-renders (new `children`, dashboard data
// loading, etc.) never repaint the sidebar DOM. Combined with
// `scrollbar-gutter: stable` in index.css (which stops the vertical
// scrollbar's appearance/disappearance from nudging the viewport across
// Tailwind's `lg:` breakpoint), that's what keeps the sidebar from
// flickering — don't remove either one.
//
// This file also OWNS the master list of every possible page in the app
// (`ViewKey`), each page's display title/subtitle (`VIEW_META`), which
// nav items show up for students vs companies vs admins (`STUDENT_NAV` /
// `COMPANY_NAV` / `ADMIN_NAV`), and which pages can be turned off by an
// admin feature flag (`VIEW_FLAG`).
// ============================================================================

import { useEffect, useState, memo } from 'react';
import {
  LayoutDashboard, User, Upload, Target, FileText, Building2, Users, MessageSquare,
  Briefcase, ScrollText, Menu, X, Moon, Sun, Palette,
  Calendar, Megaphone, FolderGit2, Bookmark, MessageCircle, Trophy, FolderKanban,
  ShieldCheck, UserCog, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme, type Theme } from '@/lib/theme';
import { useFeatureFlags } from '@/lib/featureFlags';
import { useSiteSettings } from '@/lib/siteSettings';
import { NotificationsBell } from '@/components/NotificationsBell';

// The master list of every page/screen that exists in the logged-in app.
// This is a TypeScript "union type" — `ViewKey` can ONLY ever be one of
// these exact text values, nothing else. This is what lets App.tsx's
// `switch` statement (see App.tsx) safely cover every case, and what lets
// the editor immediately flag a typo like 'dashbord' as an error.
export type ViewKey =
  | 'dashboard' | 'profile' | 'upload' | 'matches' | 'applications'
  | 'companies' | 'company-public' | 'messages' | 'friends'
  | 'settings' | 'company-dashboard' | 'company-profile' | 'jobs' | 'applicants' | 'quizzes'
  | 'ai-assistant' | 'events' | 'announcements' | 'projects' | 'bookmarks'
  | 'forum' | 'leaderboard' | 'company-events' | 'company-announcements'
  | 'admin-dashboard' | 'admin-users' | 'admin-content' | 'admin-logs';

// For each page: the big bold title and small gray subtitle shown at the
// top of the header bar. Kept as one central lookup table so every page's
// heading text lives in exactly one place.
const VIEW_META: Record<ViewKey, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'AI-driven placement insights at a glance' },
  profile: { title: 'Profile', sub: 'Manage your academic and skills profile' },
  upload: { title: 'Upload Documents', sub: 'Upload your resume for AI analysis' },
  matches: { title: 'Match & Recommendations', sub: 'Companies matched to your profile' },
  applications: { title: 'Applications', sub: "Track companies you've applied to" },
  companies: { title: 'Companies', sub: 'Browse companies and apply' },
  'company-public': { title: 'Company Profile', sub: 'Company details' },
  messages: { title: 'Messages', sub: 'Direct messages with companies and candidates' },
  friends: { title: 'Friends', sub: 'Connect with students and call your friends' },
  settings: { title: 'Settings', sub: 'Manage appearance and account' },
  'company-dashboard': { title: 'Overview', sub: 'How your hiring is going' },
  'company-profile': { title: 'Company Profile', sub: 'Manage your public company profile' },
  jobs: { title: 'Jobs', sub: 'Manage your open positions' },
  applicants: { title: 'Applicants', sub: 'Everyone who has applied to you' },
  quizzes: { title: 'Quizzes', sub: 'Create quizzes and send them to applicants' },
  'ai-assistant': { title: 'AI Career Assistant', sub: 'Your personal career guide' },
  events: { title: 'Events', sub: 'Placement drives, workshops, and guest lectures' },
  announcements: { title: 'Announcements', sub: 'Latest updates from the placement cell' },
  projects: { title: 'My Projects', sub: 'Showcase your portfolio projects' },
  bookmarks: { title: 'Bookmarks', sub: 'Companies you have saved' },
  forum: { title: 'Community Forum', sub: 'Ask questions and share advice' },
  leaderboard: { title: 'Leaderboard', sub: 'Top-ranked students by profile and matches' },
  'company-events': { title: 'Events', sub: 'Host placement drives and workshops' },
  'company-announcements': { title: 'Announcements', sub: 'Post updates for students' },
  'admin-dashboard': { title: 'Admin Overview', sub: 'Platform-wide stats and recent activity' },
  'admin-users': { title: 'User Management', sub: 'Edit profiles, change roles, ban or unban accounts' },
  'admin-content': { title: 'Content Moderation', sub: 'Review and remove jobs, announcements, events, and posts' },
  'admin-logs': { title: 'Audit Logs', sub: 'Every action taken by admins on this platform' },
};

// Maps a nav view to the feature_flags.key that gates it (see
// src/lib/featureFlags.tsx). Views not listed here (dashboard, profile,
// settings, etc.) are core and can never be turned off this way.
const VIEW_FLAG: Partial<Record<ViewKey, string>> = {
  forum: 'forum',
  events: 'events',
  'company-events': 'events',
  leaderboard: 'leaderboard',
  'ai-assistant': 'ai_assistant',
  messages: 'messaging',
  friends: 'friends',
  projects: 'projects',
  bookmarks: 'bookmarks',
};

// One entry in the sidebar nav list: which page it links to, its label
// text, and which icon component to show next to it.
type NavItem = {
  view: ViewKey;
  label: string;
  icon: typeof LayoutDashboard; // "the same TYPE as this specific icon component" — a shorthand way to say "any lucide-react icon component"
  roles?: ('student' | 'company' | 'admin')[]; // (currently unused directly here — filtering by role happens via which list is picked below, not this field)
};

// Three separate, hand-written nav lists — one per role — rather than one
// big list with role-filtering logic sprinkled through it. This keeps
// each role's menu order/content easy to see and edit at a glance.
const STUDENT_NAV: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'profile', label: 'Profile', icon: User },
  { view: 'matches', label: 'Match & Recommendations', icon: Target },
  { view: 'companies', label: 'Companies', icon: Building2 },
  { view: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { view: 'friends', label: 'Friends', icon: Users },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'upload', label: 'Upload Documents', icon: Upload },
  { view: 'applications', label: 'Applications', icon: FileText },
  { view: 'projects', label: 'My Projects', icon: FolderGit2 },
  { view: 'events', label: 'Events', icon: Calendar },
  { view: 'announcements', label: 'Announcements', icon: Megaphone },
  { view: 'forum', label: 'Community Forum', icon: MessageCircle },
  { view: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

const COMPANY_NAV: NavItem[] = [
  { view: 'company-dashboard', label: 'Overview', icon: LayoutDashboard },
  { view: 'company-profile', label: 'Company Profile', icon: Building2 },
  { view: 'jobs', label: 'Jobs', icon: Briefcase },
  { view: 'applicants', label: 'Applicants', icon: ScrollText },
  { view: 'quizzes', label: 'Quizzes', icon: ClipboardList },
  { view: 'company-events', label: 'Events', icon: Calendar },
  { view: 'company-announcements', label: 'Announcements', icon: Megaphone },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'forum', label: 'Community Forum', icon: MessageCircle },
];

// Defined here for completeness/reference, but note: App.tsx's routing
// logic no longer has any 'admin-*' views reachable from this main app —
// the admin panel lives in a separate standalone application now. This
// list is unused dead code at the moment, kept only in case the admin
// views are ever folded back into this app in the future.
const ADMIN_NAV: NavItem[] = [
  { view: 'admin-dashboard', label: 'Overview', icon: LayoutDashboard },
  { view: 'admin-users', label: 'Users', icon: UserCog },
  { view: 'admin-content', label: 'Content Moderation', icon: ClipboardList },
  { view: 'admin-logs', label: 'Audit Logs', icon: ShieldCheck },
  { view: 'announcements', label: 'Announcements', icon: Megaphone },
  { view: 'events', label: 'Events', icon: Calendar },
  { view: 'forum', label: 'Community Forum', icon: MessageCircle },
];

type Props = {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onSignOut: () => void;
  children: React.ReactNode; // whatever page App.tsx decided to show, placed inside this shell
};

// Isolated sidebar — memoized so parent re-renders (new `children`, dashboard
// data loads, etc.) do NOT repaint the sidebar DOM. This is the main fix for
// "sidebar flicker while the page is idle / loading data".
type SidebarNavProps = {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onSignOut: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

// ============================================================================
// "THE LEDGER" — navigation redesign
//
// Instead of icon bubbles (which is what nearly every dashboard uses), each
// destination is a numbered entry — a two-digit index in tabular monospace,
// then the label. The active item doesn't get a colored icon; the NUMBER
// itself becomes a filled block, and a single hairline "spine" running the
// height of the rail grows a tick mark that slides to the active row's
// position (pure CSS transform on ONE element — not a re-render of every
// row — so this stays exactly as cheap as the old "active bar" it
// replaces).
//
// Why not icons: with 14 destinations, icon bubbles either repeat visually
// similar shapes or require a legend anyway. A stable index number is
// itself a wayfinding device — "I'm on 06 of 14" tells you more about
// where you are than any icon does — and it's the thing that makes this
// rail recognizably NOT another glass sidebar.
// ============================================================================
const NavRow = memo(function NavRow({
  view, label, index, isActive, onClick,
}: { view: ViewKey; label: string; index: number; isActive: boolean; onClick: (view: ViewKey) => void }) {
  return (
    <button
      onClick={() => onClick(view)}
      className="group relative flex w-full items-center gap-3 py-2.5 pl-6 pr-3 text-left"
    >
      <span
        className={`flex h-6 w-7 flex-shrink-0 items-center justify-center font-mono text-[11px] tabular-nums transition-colors duration-150 ${
          isActive
            ? 'bg-[var(--accent)] text-[var(--bg-base)] font-bold'
            : 'text-[var(--text-muted)] group-hover:text-[var(--accent)]'
        }`}
      >
        {String(index).padStart(2, '0')}
      </span>
      <span
        className={`truncate flex-1 text-[13px] transition-all duration-150 ${
          isActive ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
        }`}
      >
        {label}
      </span>
    </button>
  );
});

const SidebarNav = memo(function SidebarNav({
  currentView,
  onNavigate,
  onSignOut,
  sidebarOpen,
  setSidebarOpen,
}: SidebarNavProps) {
  const { profile } = useAuth();
  const flags = useFeatureFlags();
  const siteSettings = useSiteSettings();
  const role = profile?.role || 'student';

  const isViewEnabled = (view: ViewKey) => {
    const flagKey = VIEW_FLAG[view];
    if (!flagKey) return true;
    return flags[flagKey] !== false;
  };

  const navItems = (role === 'company' ? COMPANY_NAV : STUDENT_NAV).filter((item) => isViewEnabled(item.view));
  const activeIndex = Math.max(0, navItems.findIndex((item) => item.view === currentView));
  const initials = (profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  // Row height is fixed (py-2.5 + text line-height ≈ 40px) so the spine
  // tick's vertical position can be computed with plain arithmetic instead
  // of measuring the DOM — keeps this a pure CSS transform, no layout
  // thrashing, no ResizeObserver.
  const ROW_HEIGHT = 40;

  const handleNav = (view: ViewKey) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  return (
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand — the site mark rendered as index "00", matching the
            ledger's own numbering language instead of a logo tile. */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden bg-[var(--accent)] font-mono text-[11px] font-bold text-[var(--bg-base)]">
            {siteSettings.logo_url ? <img src={siteSettings.logo_url} alt="" className="h-full w-full object-cover" /> : '00'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-tight text-[var(--text-primary)]">{siteSettings.site_name}</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Index / {navItems.length.toString().padStart(2, '0')}</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] lg:hidden">
            <X size={16} />
          </button>
        </div>

        {/* Nav rail: hairline spine on the far left, with a tick that
            slides (CSS transform only) to track the active row. */}
        <nav className="relative flex-1 overflow-y-auto scroll-thin py-2">
          <div className="absolute left-0 top-0 h-full w-px bg-[var(--border)]" />
          <div
            className="absolute left-0 w-px bg-[var(--accent)] transition-transform duration-200 ease-out"
            style={{ height: ROW_HEIGHT, transform: `translateY(${activeIndex * ROW_HEIGHT}px)` }}
          />
          {navItems.map((item, i) => (
            <NavRow key={item.view} view={item.view} label={item.label} index={i + 1} isActive={currentView === item.view} onClick={handleNav} />
          ))}

          {role !== 'company' && isViewEnabled('ai-assistant') && (
            <>
              <div className="my-2 mx-6 h-px bg-[var(--border)]" />
              <NavRow view="ai-assistant" label="AI Career Assistant" index={navItems.length + 1} isActive={currentView === 'ai-assistant'} onClick={handleNav} />
            </>
          )}
        </nav>

        {/* User panel — same ledger language: initials block instead of a
            circular avatar-with-gradient, plain text actions instead of
            icon buttons. */}
        <div className="border-t border-[var(--border)] px-6 py-4">
          <button
            onClick={() => handleNav(role === 'company' ? 'company-profile' : 'profile')}
            className="mb-3 flex w-full items-center gap-3 text-left"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-8 w-8 flex-shrink-0 object-cover" />
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-[var(--surface)] font-mono text-[11px] font-bold text-[var(--text-secondary)]">
                {initials}
              </div>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{profile?.full_name || 'User'}</span>
              <span className="block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{role}</span>
            </span>
          </button>
          <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            <button onClick={() => handleNav('settings')} className={`transition-colors hover:text-[var(--accent)] ${currentView === 'settings' ? 'text-[var(--accent)]' : ''}`}>
              Settings
            </button>
            <span className="text-[var(--border-strong)]">/</span>
            <button onClick={onSignOut} className="transition-colors hover:text-[var(--error)]">
              Sign out
            </button>
          </div>
        </div>
      </aside>
  );
});

function AppShell({ currentView, onNavigate, onSignOut, children }: Props) {
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false); // only relevant on mobile — the sidebar is always visible on desktop (see the `lg:translate-x-0` CSS below)
  // Which small header dropdown (if any) is currently open — only one at
  // a time, so opening the theme menu automatically closes the
  // notifications menu and vice versa.
  const [activeMenu, setActiveMenu] = useState<'theme' | 'notifications' | null>(null);

  // Note: role/profile and feature-flag-gated nav items all live inside
  // `SidebarNav` above now (it reads those hooks itself) — this outer
  // component only needs the page title/subtitle and the two header
  // dropdowns, so it doesn't re-subscribe to any of that.
  const meta = VIEW_META[currentView] || { title: 'Dashboard', sub: '' };

  // Derived purely from `currentView` (already a prop) against the two
  // module-level nav arrays — deliberately NOT a hook subscription (no
  // useAuth/useFeatureFlags here), so this can't be a source of the header
  // re-rendering on things like a Supabase auth-token refresh.
  const posLabel = (() => {
    const list = STUDENT_NAV.some((i) => i.view === currentView) ? STUDENT_NAV : COMPANY_NAV;
    const idx = list.findIndex((i) => i.view === currentView);
    return idx >= 0 ? `${String(idx + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}` : null;
  })();

  // Close whichever header dropdown is open if the user clicks anywhere
  // else on the page — the classic "click outside to dismiss" pattern
  // used throughout this app (see Select.tsx, NotificationsBell.tsx).
  useEffect(() => {
    if (!activeMenu) return;
    const close = () => setActiveMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [activeMenu]);

  // The theme choices shown in the theme-switcher dropdown, each with its own icon.
  const themeOptions: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: 'dark', label: 'Dark', icon: Moon },
    { key: 'light', label: 'Light', icon: Sun },
    { key: 'aurora', label: 'Aurora', icon: Palette },
    { key: 'midnight', label: 'Midnight', icon: Moon },
    { key: 'sunset', label: 'Sunset', icon: Palette },
    { key: 'ocean', label: 'Ocean', icon: Palette },
  ];

  return (
    <div className="flex min-h-screen">
      {/* ---------- Sidebar ---------- */}
      {/*
        On large screens (`lg:` prefix), the sidebar is always visible
        (`lg:translate-x-0`) and pushed to a fixed position on the left.
        On smaller screens, it starts off-screen (`-translate-x-full`,
        meaning "shifted left by its own full width, so it's hidden") and
        slides into view (`translate-x-0`) only when `sidebarOpen` is
        true — this is what makes the sidebar a slide-out drawer on
        mobile but a permanent fixture on desktop, using pure CSS classes
        rather than two separate components.
      */}
      <SidebarNav
        currentView={currentView}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* On mobile only, a dim backdrop appears behind the open sidebar —
          clicking it closes the sidebar, same "click outside" pattern
          used elsewhere. `lg:hidden` means this backdrop never appears
          at all on desktop, where the sidebar isn't a temporary overlay. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ---------- Main content area ---------- */}
      {/* `lg:ml-64` pushes this whole section right on desktop, to make
          room for the fixed-position flush sidebar (w-64 = 256px, no
          floating inset this time — the ledger rail is a structural panel,
          not a card). */}
      <div className="flex flex-1 flex-col lg:ml-64 min-w-0">
        {/* Header — same ledger grammar as the sidebar: the page title is
            prefixed with its position in the current nav list ("03 / 14")
            instead of a plain heading, and action buttons are square,
            flat, bordered — no rounded pill buttons. */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-base)] px-4 py-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center border border-[var(--border-strong)] text-[var(--text-secondary)] lg:hidden"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                {posLabel && <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{posLabel}</span>}
                <h1 className="truncate text-lg font-bold text-[var(--text-primary)] md:text-xl">{meta.title}</h1>
              </div>
              <p className="hidden truncate text-xs text-[var(--text-muted)] md:block">{meta.sub}</p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 md:gap-3">
            {/* ---- Theme switcher button + dropdown ---- */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation(); // stop this click from immediately triggering the "click outside closes menu" listener above
                  setActiveMenu(activeMenu === 'theme' ? null : 'theme'); // toggle: open if closed, close if already open
                }}
                className="flex h-9 w-9 items-center justify-center border border-[var(--border-strong)] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label="Switch theme"
              >
                {/* The icon shown on the button itself matches whichever
                    theme is CURRENTLY active. */}
                {theme === 'light' ? <Sun size={20} /> : theme === 'dark' || theme === 'midnight' ? <Moon size={20} /> : <Palette size={20} />}
              </button>
              {activeMenu === 'theme' && (
                <div className="dropdown-panel absolute right-0 top-12 z-50 w-48 p-2 animate-slide-down" onClick={(e) => e.stopPropagation()}>
                  {themeOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setTheme(opt.key);
                        setActiveMenu(null);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        theme === opt.key
                          ? 'bg-[var(--surface-hover)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <opt.icon size={16} />
                      {opt.label} Theme
                      {theme === opt.key && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* The bell icon + dropdown lives in its own component (see
                NotificationsBell.tsx) — this shell just tells it when
                it's open/closed as part of the shared `activeMenu`
                on/off state, so only one header dropdown is ever open at once. */}
            <NotificationsBell
              onNavigate={(v) => onNavigate(v as ViewKey)}
              open={activeMenu === 'notifications'}
              onOpenChange={(v) => setActiveMenu(v ? 'notifications' : null)}
            />
          </div>
        </header>

        {/* The actual page content, whatever App.tsx decided `children`
            should be. IMPORTANT: no `key={currentView}` here — that forces
            React to fully unmount and remount the entire page on every
            single navigation (destroying and rebuilding its whole DOM
            subtree, replaying every mount animation), which is a real
            source of visible flicker on nav. Each view already manages its
            own loading/empty states internally, so it doesn't need a fresh
            identity to reset itself — normal prop/state updates are enough. */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

const AppShellMemo = memo(AppShell);
export { AppShellMemo as AppShell };
