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
  Settings, LogOut, Briefcase, ScrollText, Sparkles, Menu, X, Moon, Sun, Palette,
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

// One nav row — icon bubble on the left morphs from a circle at rest to a
// rounded square when active/hovered (the classic Discord "squircle"
// transition), with a slim active-indicator bar riding the item's left
// edge instead of a trailing dot.
//
// IMPORTANT: this is a MODULE-LEVEL component (defined once, outside of
// and above `SidebarNav`) — not a function defined inside SidebarNav's
// body. That distinction is what was actually causing the flicker: a
// component defined inside another component's render function is a
// brand-new function/type on every single render of the parent, so React
// can't tell it's "the same" `NavRow` as last time — it tears down and
// rebuilds the DOM for every nav item from scratch. With 14 items in the
// student nav, that's 14 buttons unmounting and remounting, which is
// exactly the flicker that showed up specifically once there were a lot
// of sidebar items. Defining it once, up here, means it's the same
// component reference across every render, so React just updates props
// in place instead of remounting anything.
const NavRow = memo(function NavRow({
  view, label, icon: Icon, isActive, onClick,
}: NavItem & { isActive: boolean; onClick: (view: ViewKey) => void }) {
  return (
    <button
      onClick={() => onClick(view)}
      className="group relative flex w-full items-center gap-3 rounded-[12px] py-2 pl-4 pr-2.5 text-[13px] font-medium transition-colors duration-150"
    >
      {/* Active indicator bar — sits just outside the row, Discord-style */}
      <span
        className={`absolute -left-2.5 top-1/2 w-1 -translate-y-1/2 rounded-full bg-[var(--accent)] transition-all duration-200 ${
          isActive ? 'h-5 opacity-100' : 'h-0 opacity-0 group-hover:h-2.5 group-hover:opacity-60'
        }`}
      />
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center transition-all duration-200 ${
          isActive
            ? 'rounded-[12px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-md shadow-[var(--accent)]/25'
            : 'rounded-full bg-[var(--surface)] text-[var(--text-muted)] group-hover:rounded-[12px] group-hover:bg-[var(--surface-hover)] group-hover:text-[var(--text-secondary)]'
        }`}
      >
        <Icon size={16} strokeWidth={isActive ? 2.25 : 1.75} />
      </span>
      <span className={`truncate flex-1 text-left transition-colors ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
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
  const initials = (profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  const handleNav = (view: ViewKey) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  return (
      <aside
        className={`sidebar-glass fixed inset-y-3 left-3 z-50 flex w-64 flex-col rounded-[24px] shadow-2xl transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex-shrink-0 overflow-hidden shadow-lg shadow-[var(--accent)]/15">
            {siteSettings.logo_url ? (
              <img src={siteSettings.logo_url} alt={siteSettings.site_name} className="h-full w-full object-cover" />
            ) : (
              <Sparkles size={18} className="text-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-tight">{siteSettings.site_name}</div>
            <div className="text-[11px] text-[var(--text-muted)] truncate leading-tight">AI Placement Portal</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Nav — same structure for student & company (navItems already role-filtered).
            `pl-2.5` gives the active-indicator bar (which sits outside each row,
            at a negative offset) room to breathe without clipping against the edge. */}
        <nav className="flex-1 overflow-y-auto scroll-thin px-2.5 py-3 pl-[18px]">
          <span className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Main</span>
          <div className="mt-1.5 space-y-0.5">
            {navItems.map((item) => (
              <NavRow key={item.view} {...item} isActive={currentView === item.view} onClick={handleNav} />
            ))}
          </div>

          {role !== 'company' && isViewEnabled('ai-assistant') && (
            <>
              <span className="mt-5 block px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tools</span>
              <div className="mt-1.5 space-y-0.5">
                <NavRow view="ai-assistant" label="AI Career Assistant" icon={Sparkles} isActive={currentView === 'ai-assistant'} onClick={handleNav} />
              </div>
            </>
          )}
        </nav>

        {/* User panel — pinned to the bottom, Discord-style: avatar + name
            on the left, quick-action icons (Settings, Sign Out) on the
            right, all inside one glass row instead of two stacked
            full-width buttons. */}
        <div className="border-t border-[var(--border)] p-2.5">
          <div className="flex items-center gap-2 rounded-[14px] bg-[var(--surface)] p-1.5 pr-1.5">
            <button
              onClick={() => handleNav(role === 'company' ? 'company-profile' : 'profile')}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[11px] px-1.5 py-1 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[11px] font-bold text-white">
                  {initials}
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{profile?.full_name || 'User'}</span>
                <span className="block truncate text-[11px] text-[var(--text-muted)] capitalize">{role}</span>
              </span>
            </button>
            <button
              onClick={() => handleNav('settings')}
              aria-label="Settings"
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] transition-colors ${
                currentView === 'settings' ? 'bg-[var(--surface-hover)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Settings size={16} />
            </button>
            <button
              onClick={onSignOut}
              aria-label="Sign out"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] text-[var(--text-muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-400"
            >
              <LogOut size={16} />
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
      {/* `lg:ml-[280px]` pushes this whole section right on desktop, to make
          room for the permanently-visible sidebar (w-64 = 256px, plus its
          left-3 = 12px inset, plus 12px breathing room) — on mobile, there's
          no left margin needed since the sidebar floats on top instead of
          pushing content aside. */}
      <div className="flex flex-1 flex-col lg:ml-[280px] min-w-0">
        {/* The top header bar — sticky, so it stays visible while
            scrolling through a long page. Only holds the page title +
            theme/notifications now — profile, settings, and sign-out all
            live in the sidebar's bottom user panel instead, so there's no
            duplicate avatar button competing for space here. */}
        <header className="header-glass sticky top-0 z-30 flex items-center justify-between px-4 py-3.5 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* The hamburger menu button that opens the sidebar — only
                shown on mobile (`lg:hidden`), since desktop's sidebar is
                already always open. */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-[var(--text-primary)] md:text-xl">{meta.title}</h1>
              {/* The subtitle is hidden on small screens (`hidden
                  md:block`) to save vertical space where it matters most. */}
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)]"
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
            should be. `key={currentView}` gives this wrapper a fresh
            identity per navigation. */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div key={currentView}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

const AppShellMemo = memo(AppShell);
export { AppShellMemo as AppShell };
