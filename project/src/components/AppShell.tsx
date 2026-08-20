// ============================================================================
// src/components/AppShell.tsx
//
// WHAT THIS FILE IS: the surrounding "frame" of the entire logged-in app
// — the left sidebar navigation, the top header bar (page title, theme
// switcher, notifications bell, profile button), and the content area
// where whichever page App.tsx picked gets placed (`{children}`). Every
// single view in src/views/ gets wrapped in this same shell, so
// navigation always looks and behaves consistently no matter which page
// you're on.
//
// This file also OWNS the master list of every possible page in the app
// (`ViewKey`), each page's display title/subtitle (`VIEW_META`), which
// nav items show up for students vs companies vs admins (`STUDENT_NAV` /
// `COMPANY_NAV` / `ADMIN_NAV`), and which pages can be turned off by an
// admin feature flag (`VIEW_FLAG`).
// ============================================================================

import { useEffect, useState } from 'react';
import {
  LayoutDashboard, User, Upload, Target, FileText, Building2, Users, MessageSquare,
  Settings, LogOut, Briefcase, ScrollText, Sparkles, Menu, X, Moon, Sun, Palette,
  Calendar, Megaphone, FolderGit2, Bookmark, MessageCircle, Trophy, FolderKanban,
  ShieldCheck, UserCog, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme, type Theme } from '@/lib/theme';
import { useFeatureFlags, useFeatureFlagsLoaded } from '@/lib/featureFlags';
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

export function AppShell({ currentView, onNavigate, onSignOut, children }: Props) {
  console.log('[flicker-debug] AppShell rendering at', performance.now().toFixed(0) + 'ms');
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const flags = useFeatureFlags();
  const flagsLoaded = useFeatureFlagsLoaded();
  const siteSettings = useSiteSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false); // only relevant on mobile — the sidebar is always visible on desktop (see the `lg:translate-x-0` CSS below)
  // Which small header dropdown (if any) is currently open — only one at
  // a time, so opening the theme menu automatically closes the
  // notifications menu and vice versa.
  const [activeMenu, setActiveMenu] = useState<'theme' | 'notifications' | null>(null);

  // Checks whether a given page is allowed to appear at all, based on the
  // admin's feature flags (see VIEW_FLAG above). A view with no flag
  // mapped to it is always enabled and never depends on the flags fetch.
  //
  // A view THAT DOES have a flag is deliberately hidden until the flags
  // fetch resolves (`flagsLoaded`), rather than showing it immediately and
  // possibly yanking it away a moment later — flags default to "on"
  // everywhere else in the app, which is right for most consumers, but for
  // the sidebar specifically that default meant every flag-gated item
  // (Messages, Forum, Events, Leaderboard, AI Assistant, Friends,
  // Projects, Bookmarks) would flash into view on every page load and then
  // disappear again the instant the real (disabled) flag value arrived —
  // that flash was the reported sidebar flicker. Waiting one short beat
  // for `flagsLoaded` means each item is only ever drawn once, in its
  // final state.
  const isViewEnabled = (view: ViewKey) => {
    const flagKey = VIEW_FLAG[view];
    if (!flagKey) return true;
    if (!flagsLoaded) return false;
    return flags[flagKey] !== false;
  };

  const role = profile?.role || 'student';
  // Pick the right nav list for this role, THEN filter out any items
  // disabled by a feature flag — so a disabled feature's nav link simply
  // doesn't appear in the sidebar at all.
  const navItems = (role === 'company' ? COMPANY_NAV : STUDENT_NAV).filter((item) => isViewEnabled(item.view));
  const meta = VIEW_META[currentView] || { title: 'Dashboard', sub: '' };

  // Two-letter initials shown as a fallback avatar when the user hasn't
  // uploaded a profile picture.
  const initials = (profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  // Navigating on mobile should also auto-close the slide-out sidebar
  // (desktop's sidebar is always visible, so `setSidebarOpen(false)`
  // there is harmless — it's just already closed/inapplicable).
  const handleNav = (view: ViewKey) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  // Close whichever header dropdown is open if the user clicks anywhere
  // else on the page — the classic "click outside to dismiss" pattern
  // used throughout this app (see Select.tsx, NotificationsBell.tsx).
  useEffect(() => {
    if (!activeMenu) return;
    const close = () => setActiveMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [activeMenu]);

  // The three theme choices shown in the theme-switcher dropdown, each
  // with its own icon.
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
      <aside
        className={`sidebar-glass fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex-shrink-0 overflow-hidden shadow-lg shadow-[var(--accent)]/15">
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

        {/* Nav — same structure for student & company (navItems already role-filtered) */}
        <nav className="flex-1 overflow-y-auto scroll-thin px-2.5 py-3">
          <span className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Main</span>
          <div className="mt-1.5 space-y-0.5">
            {navItems.map((item) => {
              const isActive = currentView === item.view;
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  onClick={() => handleNav(item.view)}
                  className={`group flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/25 shadow-sm shadow-[var(--accent)]/5'
                      : 'text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] transition-colors ${
                    isActive ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--surface)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                  }`}>
                    <Icon size={16} strokeWidth={isActive ? 2.25 : 1.75} />
                  </span>
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {role !== 'company' && isViewEnabled('ai-assistant') && (
            <>
              <span className="mt-5 block px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tools</span>
              <div className="mt-1.5 space-y-0.5">
                <button
                  onClick={() => handleNav('ai-assistant')}
                  className={`group flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ${
                    currentView === 'ai-assistant'
                      ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/25 shadow-sm shadow-[var(--accent)]/5'
                      : 'text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] transition-colors ${
                    currentView === 'ai-assistant' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--surface)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                  }`}>
                    <Sparkles size={16} strokeWidth={currentView === 'ai-assistant' ? 2.25 : 1.75} />
                  </span>
                  <span className="truncate flex-1 text-left">AI Career Assistant</span>
                  {currentView === 'ai-assistant' && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />}
                </button>
              </div>
            </>
          )}
        </nav>

        {/* Footer actions */}
        <div className="border-t border-[var(--border)] px-2.5 py-3 space-y-0.5">
          <button
            onClick={() => handleNav('settings')}
            className={`flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ${
              currentView === 'settings'
                ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-[var(--surface)] text-[var(--text-muted)]">
              <Settings size={16} />
            </span>
            <span>Settings</span>
          </button>
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-[var(--surface)] text-[var(--text-muted)]">
              <LogOut size={16} />
            </span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* On mobile only, a dim backdrop appears behind the open sidebar —
          clicking it closes the sidebar, same "click outside" pattern
          used elsewhere. `lg:hidden` means this backdrop never appears
          at all on desktop, where the sidebar isn't a temporary overlay. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ---------- Main content area ---------- */}
      {/* `lg:ml-64` pushes this whole section right on desktop, to make
          room for the permanently-visible sidebar (which is 64 units
          wide) — on mobile, there's no left margin needed since the
          sidebar floats on top instead of pushing content aside. */}
      <div className="flex flex-1 flex-col lg:ml-64 min-w-0 app-shell-main">
        {/* The top header bar — sticky, so it stays visible while
            scrolling through a long page. */}
        <header className="header-glass sticky top-0 z-30 flex items-center justify-between px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            {/* The hamburger menu button that opens the sidebar — only
                shown on mobile (`lg:hidden`), since desktop's sidebar is
                already always open. */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)] md:text-xl">{meta.title}</h1>
              {/* The subtitle is hidden on small screens (`hidden
                  md:block`) to save vertical space where it matters most. */}
              <p className="hidden text-xs text-[var(--text-muted)] md:block">{meta.sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
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

            {/* Profile button — clicking your own avatar/name jumps
                straight to your own profile page (a different page
                depending on role: 'profile' for students, 'company-profile'
                for companies). */}
            <button
              onClick={() => onNavigate(role === 'company' ? 'company-profile' : 'profile')}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] py-1.5 pl-1.5 pr-3 transition-all hover:border-[var(--accent)]"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">
                  {initials}
                </div>
              )}
              {/* The name text is hidden on the very smallest screens
                  (`hidden sm:block`) to leave room for everything else in
                  a cramped header — the avatar alone is still shown. */}
              <span className="hidden text-sm font-medium text-[var(--text-primary)] sm:block max-w-[120px] truncate">
                {profile?.full_name || 'User'}
              </span>
            </button>
          </div>
        </header>

        {/* The actual page content, whatever App.tsx decided `children`
            should be. `key={currentView}` is a small but important
            detail: giving this wrapper a `key` that changes every time
            the view changes tells React "treat this as a brand new
            element, not an update to the old one" — which is what
            re-triggers the `animate-fade-in` CSS animation fresh on every
            single page navigation, instead of only playing once ever. */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
