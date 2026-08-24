// ============================================================================
// src/components/AppShell.tsx
//
// WHAT THIS FILE IS: the surrounding "frame" of the entire logged-in app
// — the left floating glass sidebar navigation (Discord-style: icon
// bubbles, a sliding active pill, user panel pinned to the bottom), the
// floating glass header bar (page title, theme switcher, notifications
// bell), and the content area where whichever page App.tsx picked gets
// placed (`{children}`). Every single view in src/views/ gets wrapped in
// this same shell, so navigation always looks and behaves consistently
// no matter which page you're on.
//
// ANTI-FLICKER NOTES (both still required, do not remove):
//   1. `SidebarNav` below is its own `memo`-wrapped component so parent
//      re-renders (new `children`, dashboard data loading, etc.) never
//      repaint the sidebar DOM.
//   2. `scrollbar-gutter: stable` in index.css stops the vertical
//      scrollbar's appearance/disappearance from nudging the viewport
//      across Tailwind's `lg:` breakpoint, which used to flip the
//      sidebar's visibility classes on and off.
// These two are what actually caused the old flicker — NOT the glass
// blur on the sidebar/header, which is back (see `.sidebar-glass` /
// `.header-glass` in index.css for how it stays cheap: fixed panels
// only, promoted to their own compositor layer, never blurring anything
// that itself scrolls or resizes).
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
// "SIGNAL" — navigation, Discord-grammar
//
// Icon bubble per destination + one floating active pill that slides
// (pure CSS transform on ONE element, not a re-render of every row — same
// trick the previous numbered rail used, just applied to a pill instead of
// a spine tick) — so this is exactly as cheap as what it replaces.
//
// The pill is a real glass surface (see `.nav-pill` in index.css): heavy
// blur + accent glow, sitting behind whichever row is active. Rows
// themselves are plain buttons with no per-row blur — only the ONE pill
// element pays the blur cost, and it only moves on nav, so there's no
// per-frame blur churn from scrolling or hovering.
// ============================================================================
const NavRow = memo(function NavRow({
  view, label, icon: Icon, isActive, onClick,
}: { view: ViewKey; label: string; icon: typeof LayoutDashboard; isActive: boolean; onClick: (view: ViewKey) => void }) {
  return (
    <button
      onClick={() => onClick(view)}
      className="group relative z-10 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150"
    >
      <span
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
          isActive
            ? 'bg-[var(--accent)] text-white shadow-[0_0_16px_var(--accent-glow)]'
            : 'text-[var(--text-muted)] group-hover:bg-[var(--surface-hover)] group-hover:text-[var(--accent)]'
        }`}
      >
        <Icon size={17} />
      </span>
      <span
        className={`truncate flex-1 text-[13px] transition-colors duration-150 ${
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

  // Row height is fixed (py-2.5 + icon ≈ 44px incl. gap) so the pill's
  // vertical position can be computed with plain arithmetic instead of
  // measuring the DOM — keeps this a pure CSS transform, no layout
  // thrashing, no ResizeObserver. Matches `gap-1` between NavRow buttons.
  const ROW_HEIGHT = 44;

  const handleNav = (view: ViewKey) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  return (
      // Floating glass card, not a flush structural panel: inset on all
      // sides (`inset-y-3 left-3`), fully rounded, real backdrop blur via
      // `sidebar-glass` (see index.css for why this is flicker-safe).
      <aside
        className={`sidebar-glass fixed inset-y-3 left-3 z-50 flex w-64 flex-col rounded-3xl transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%+0.75rem)]'
        }`}
      >
        {/* Brand — a Discord-style rounded square mark instead of the
            ledger's index-00 block. */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--accent)] text-sm font-bold text-white shadow-[0_0_18px_var(--accent-glow)]">
            {siteSettings.logo_url ? <img src={siteSettings.logo_url} alt="" className="h-full w-full object-cover" /> : siteSettings.site_name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-tight text-[var(--text-primary)]">{siteSettings.site_name}</div>
            <div className="truncate text-[11px] text-[var(--text-muted)]">{navItems.length} destinations</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] lg:hidden">
            <X size={16} />
          </button>
        </div>

        {/* Nav rail: one floating pill (real glass, accent glow) slides
            behind the active row via CSS transform only — the row buttons
            themselves never re-render on nav, only the pill moves. */}
        <nav className="relative flex-1 overflow-y-auto scroll-thin px-3 py-1">
          <div
            className="nav-pill absolute left-3 right-3 rounded-xl transition-transform duration-200 ease-out"
            style={{ height: ROW_HEIGHT - 4, transform: `translateY(${activeIndex * ROW_HEIGHT + 2}px)` }}
          />
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavRow key={item.view} view={item.view} label={item.label} icon={item.icon} isActive={currentView === item.view} onClick={handleNav} />
            ))}
          </div>

          {role !== 'company' && isViewEnabled('ai-assistant') && (
            <>
              <div className="my-2 mx-2 h-px bg-[var(--border)]" />
              <NavRow view="ai-assistant" label="AI Career Assistant" icon={ScrollText} isActive={currentView === 'ai-assistant'} onClick={handleNav} />
            </>
          )}
        </nav>

        {/* User panel — circular avatar, Discord-style pinned footer. */}
        <div className="border-t border-[var(--border)] px-4 py-4">
          <button
            onClick={() => handleNav(role === 'company' ? 'company-profile' : 'profile')}
            className="mb-3 flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[12px] font-bold text-[var(--text-secondary)]">
                {initials}
              </div>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{profile?.full_name || 'User'}</span>
              <span className="block truncate text-[11px] capitalize text-[var(--text-muted)]">{role}</span>
            </span>
          </button>
          <div className="flex items-center gap-3 px-1.5 text-[11px] text-[var(--text-muted)]">
            <button onClick={() => handleNav('settings')} className={`transition-colors hover:text-[var(--accent)] ${currentView === 'settings' ? 'text-[var(--accent)]' : ''}`}>
              Settings
            </button>
            <span className="text-[var(--border-strong)]">·</span>
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
      {/* `lg:ml-[19rem]` pushes this section right on desktop to clear the
          floating sidebar: 0.75rem inset + 16rem width + 0.75rem gap to
          the content ≈ 19rem — the sidebar is a floating card again, not
          a flush edge-to-edge panel, so content can't just butt up
          against it at ml-64 anymore. */}
      <div className="flex flex-1 flex-col lg:ml-[19rem] min-w-0">
        {/* Header — floating glass bar, same rounded/blurred language as
            the sidebar, inset from the top edge to match. */}
        <header className="header-glass sticky top-3 z-30 mx-3 flex items-center justify-between rounded-2xl px-4 py-3.5 md:px-6 lg:ml-0 lg:mr-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-secondary)] lg:hidden"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                {posLabel && <span className="text-xs tabular-nums text-[var(--text-muted)]">{posLabel}</span>}
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
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
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
