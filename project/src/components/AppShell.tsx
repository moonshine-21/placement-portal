// ============================================================================
// src/components/AppShell.tsx
//
// WHAT THIS FILE IS: the surrounding "frame" of the entire logged-in app
// — a single sticky top navigation bar (brand, horizontally-scrolling nav
// pills, theme switcher, notifications bell, profile menu) and the content
// area where whichever page App.tsx picked gets placed (`{children}`).
// Every single view in src/views/ gets wrapped in this same shell, so
// navigation always looks and behaves consistently no matter which page
// you're on. (There used to be a left sidebar here — replaced with this
// top nav so pages get the full page width instead of losing 256px to a
// permanent side rail.)
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
  ShieldCheck, UserCog, ClipboardList, ChevronDown,
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


function AppShell({ currentView, onNavigate, onSignOut, children }: Props) {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const flags = useFeatureFlags();
  const flagsLoaded = useFeatureFlagsLoaded();
  const siteSettings = useSiteSettings();
  // Which small header dropdown (if any) is currently open — only one at
  // a time, so opening one menu automatically closes the others. 'nav' is
  // the mobile-only full menu dropdown that replaces the old slide-out
  // sidebar drawer; 'profile' is the avatar menu (profile/settings/sign out).
  const [activeMenu, setActiveMenu] = useState<'theme' | 'notifications' | 'nav' | 'profile' | null>(null);

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

  // Navigating should also close whichever header dropdown triggered it
  // (the mobile nav menu, or the profile menu).
  const handleNav = (view: ViewKey) => {
    onNavigate(view);
    setActiveMenu(null);
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

  // The AI Career Assistant link isn't part of either role's core nav
  // list above — students get it appended as a distinct entry (companies
  // don't see it at all), same as the old sidebar's separate "Tools" group.
  const allNavItems: NavItem[] = role !== 'company' && isViewEnabled('ai-assistant')
    ? [...navItems, { view: 'ai-assistant', label: 'AI Assistant', icon: Sparkles }]
    : navItems;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------- Top navigation bar (replaces the old left sidebar) ---------- */}
      {/* Sticky + `z-40` so it always stays above page content, but below
          the mobile nav/profile dropdown panels (`z-50`) that hang off it. */}
      <header className="topnav-glass sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
          {/* Brand — flex-shrink-0 so it never gets squeezed by the nav
              row or right-hand icon cluster, which is exactly what was
              causing icons to overlap/clip in the old fixed-width layout. */}
          <button
            onClick={() => onNavigate(role === 'company' ? 'company-dashboard' : 'dashboard')}
            className="flex flex-shrink-0 items-center gap-2.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex-shrink-0 overflow-hidden shadow-lg shadow-[var(--accent)]/15">
              {siteSettings.logo_url ? (
                <img src={siteSettings.logo_url} alt={siteSettings.site_name} className="h-full w-full object-cover" />
              ) : (
                <Sparkles size={16} className="text-white" />
              )}
            </div>
            <span className="hidden text-[15px] font-semibold text-[var(--text-primary)] sm:block">{siteSettings.site_name}</span>
          </button>

          {/* Desktop nav — a single horizontally-scrolling row of pills
              instead of a fixed-height vertical list. `min-w-0` is what
              lets this row actually shrink/scroll instead of forcing the
              header to overflow the viewport; `scrollbar-hide` keeps that
              scroll affordance invisible so it still reads as a clean pill
              bar rather than a scroll pane. */}
          <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide lg:flex">
            {allNavItems.map((item) => {
              const isActive = currentView === item.view;
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  onClick={() => handleNav(item.view)}
                  className={`nav-pill ${isActive ? 'active' : ''}`}
                >
                  <Icon size={15} strokeWidth={isActive ? 2.25 : 1.75} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Mobile hamburger — opens the dropdown menu below in place of
              the old slide-out drawer. Only the icon cluster to its right
              is flex-shrink-0 as well, so on narrow screens this button
              and the icons never collide — there's simply nothing left
              to overlap since the nav row above is hidden entirely. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(activeMenu === 'nav' ? null : 'nav');
            }}
            className="ml-auto flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] lg:hidden"
            aria-label="Open menu"
          >
            {activeMenu === 'nav' ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Notifications stays visible at every width (unlike theme
              switcher/profile below, it isn't duplicated in the mobile nav
              dropdown) — always its own flex-shrink-0 slot so it never
              has to share cramped space with the hamburger. */}
          <div className="flex-shrink-0">
            <NotificationsBell
              onNavigate={(v) => onNavigate(v as ViewKey)}
              open={activeMenu === 'notifications'}
              onOpenChange={(v) => setActiveMenu(v ? 'notifications' : null)}
            />
          </div>

          {/* Right-hand icon cluster — flex-shrink-0 and never sharing a
              row with unbounded text, so it can't be pushed off-screen or
              overlapped the way it was when the header title's width was
              unpredictable. */}
          <div className="hidden flex-shrink-0 items-center gap-2 md:flex">
            {/* ---- Theme switcher button + dropdown ---- */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === 'theme' ? null : 'theme');
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)]"
                aria-label="Switch theme"
              >
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

            {/* ---- Profile button + dropdown ---- */}
            {/* Clicking the avatar now opens a menu (view profile /
                settings / sign out) instead of jumping straight to the
                profile page — the old sidebar had Settings and Sign Out
                as two separate always-visible footer buttons; folding
                them into this menu is what makes room for them without
                a sidebar to hold them. */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === 'profile' ? null : 'profile');
                }}
                className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] py-1.5 pl-1.5 pr-2.5 transition-all hover:border-[var(--accent)]"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">
                    {initials}
                  </div>
                )}
                <span className="hidden max-w-[110px] truncate text-sm font-medium text-[var(--text-primary)] xl:block">
                  {profile?.full_name || 'User'}
                </span>
                <ChevronDown size={14} className="hidden text-[var(--text-muted)] xl:block" />
              </button>
              {activeMenu === 'profile' && (
                <div className="dropdown-panel absolute right-0 top-12 z-50 w-56 p-2 animate-slide-down" onClick={(e) => e.stopPropagation()}>
                  <div className="border-b border-[var(--border)] px-3 py-2 mb-1">
                    <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{profile?.full_name || 'User'}</div>
                    <div className="truncate text-xs text-[var(--text-muted)]">{profile?.email}</div>
                  </div>
                  <button
                    onClick={() => handleNav(role === 'company' ? 'company-profile' : 'profile')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    <User size={16} /> View Profile
                  </button>
                  <button
                    onClick={() => handleNav('settings')}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    <Settings size={16} /> Settings
                  </button>
                  <button
                    onClick={onSignOut}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------- Mobile nav dropdown ---------- */}
        {/* Replaces the old slide-out sidebar drawer entirely: same full
            page/role menu, but rendered as a dropdown panel hanging off
            the header instead of a `fixed` panel sliding in from the
            left. Includes account actions too, since there's no sidebar
            footer left to hold them on mobile. */}
        {activeMenu === 'nav' && (
          <div className="lg:hidden border-t border-[var(--border)] px-4 py-3 animate-slide-down" onClick={(e) => e.stopPropagation()}>
            <div className="grid max-h-[60vh] grid-cols-2 gap-1 overflow-y-auto scroll-thin sm:grid-cols-3">
              {allNavItems.map((item) => {
                const isActive = currentView === item.view;
                const Icon = item.icon;
                return (
                  <button
                    key={item.view}
                    onClick={() => handleNav(item.view)}
                    className={`flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[13px] font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/25'
                        : 'text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.25 : 1.75} className="flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-[var(--border)] pt-3">
              <button onClick={() => handleNav(role === 'company' ? 'company-profile' : 'profile')} className="flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-[var(--surface)] px-3 py-2.5 text-[13px] font-medium text-[var(--text-secondary)]">
                <User size={16} /> Profile
              </button>
              <button onClick={() => handleNav('settings')} className="flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-[var(--surface)] px-3 py-2.5 text-[13px] font-medium text-[var(--text-secondary)]">
                <Settings size={16} /> Settings
              </button>
              <button onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); }} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-[var(--surface)] text-[var(--text-secondary)]">
                {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button onClick={onSignOut} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-rose-500/10 text-rose-400">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ---------- Main content area ---------- */}
      {/* No more `lg:ml-64` — there's no fixed sidebar reserving space
          any more, so content is simply centered with its own max-width,
          full-bleed on mobile. */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-6 md:py-6">
          <div className="mb-5 md:mb-6">
            <h1 className="text-xl font-bold text-[var(--text-primary)] md:text-2xl">{meta.title}</h1>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">{meta.sub}</p>
          </div>
          {/* `key={currentView}` forces a fresh mount per page navigation. */}
          <div key={currentView}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

const AppShellMemo = memo(AppShell);
export { AppShellMemo as AppShell };
