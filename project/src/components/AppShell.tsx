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

import { useEffect, useRef, useState } from 'react';
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
import { AnchoredPortal } from '@/components/AnchoredPortal';

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
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const flags = useFeatureFlags();
  const flagsLoaded = useFeatureFlagsLoaded();
  const siteSettings = useSiteSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false); // only relevant on mobile — the sidebar is always visible on desktop (see the `lg:translate-x-0` CSS below)
  // Which small header dropdown (if any) is currently open — only one at
  // a time, so opening the theme menu automatically closes the
  // notifications menu and vice versa.
  const [activeMenu, setActiveMenu] = useState<'theme' | 'notifications' | 'profile' | null>(null);
  // Where the profile avatar button is on screen — the popover (rendered
  // through a portal, see AnchoredPortal.tsx) measures off this to
  // position itself directly under the avatar no matter which page is open.
  const profileButtonRef = useRef<HTMLButtonElement>(null);

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
        // NOTE ON THE FLICKER FIX: this used to be `bg-[var(--bg-elevated)]/80
        // backdrop-blur-xl` — a translucent, LIVE-blurred panel sitting
        // directly on top of the always-animating particle canvas
        // (ParticleBackground.tsx). `backdrop-filter` has to be
        // recalculated by the browser's compositor on every single frame
        // the canvas changes underneath it (60 times a second), and since
        // the sidebar is `fixed` and mounted for the entire session, that
        // recalculation was constant — which is what showed up as visible
        // flicker/jank in the sidebar specifically. Using a solid-enough
        // (95% opaque) background instead keeps the same dark glass look
        // without asking the compositor to re-blur a moving layer forever.
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]/95 transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo/brand row at the very top of the sidebar. Name and logo
            come from the `site_settings` table (editable by an owner from
            the admin app's Site Settings page) — falls back to the
            Sparkles icon if no custom logo has been uploaded yet. */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--border)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-transparent bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex-shrink-0 overflow-hidden transition-all hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--accent)]/20">
            {siteSettings.logo_url ? (
              <img src={siteSettings.logo_url} alt={siteSettings.site_name} className="h-full w-full object-cover" />
            ) : (
              <Sparkles size={20} className="text-white" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[var(--text-primary)] truncate">{siteSettings.site_name}</div>
            <div className="text-xs text-[var(--text-muted)]">AI Placement Portal</div>
          </div>
          {/* The X close button only makes sense on mobile (`lg:hidden`
              hides it on desktop, where the sidebar can't be closed anyway). */}
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-[var(--text-muted)]">
            <X size={20} />
          </button>
        </div>

        {/* The scrollable list of nav links (`overflow-y-auto` lets this
            section scroll independently if there are more items than fit
            on screen, without the whole sidebar scrolling). */}
        <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-4">
          <span className="px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Main</span>
          <div className="mt-2 space-y-1">
            {navItems.map((item) => {
              const isActive = currentView === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => handleNav(item.view)}
                  // The active/selected nav item gets a highlighted
                  // gradient background + accent-colored text + a
                  // small glowing dot on the right; all others get a
                  // subtle hover effect (icon "bubbles up" into its own
                  // tinted chip and the whole row nudges right slightly,
                  // so hovering the sidebar feels lively without any new
                  // compositor cost — it's all cheap transform/color
                  // transitions, not backdrop-filter).
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/30'
                      : 'text-[var(--text-secondary)] hover:translate-x-0.5 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-150 ${
                      isActive
                        ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-md shadow-[var(--accent)]/30'
                        : 'text-[var(--text-muted)] group-hover:bg-[var(--surface)] group-hover:text-[var(--accent)]'
                    }`}
                  >
                    <item.icon size={16} />
                  </span>
                  <span className="truncate">{item.label}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                </button>
              );
            })}
          </div>

          {/* The AI Career Assistant gets its own separate "Tools"
              section, shown for students, admins, and owners (companies
              don't have this feature) and only if the admin hasn't
              disabled it. */}
          {role !== 'company' && isViewEnabled('ai-assistant') && (
            <>
              <span className="mt-6 block px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Tools</span>
              <div className="mt-2 space-y-1">
                <button
                  onClick={() => handleNav('ai-assistant')}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    currentView === 'ai-assistant'
                      ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/30'
                      : 'text-[var(--text-secondary)] hover:translate-x-0.5 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-150 ${
                      currentView === 'ai-assistant'
                        ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white shadow-md shadow-[var(--accent)]/30'
                        : 'text-[var(--text-muted)] group-hover:bg-[var(--surface)] group-hover:text-[var(--accent)]'
                    }`}
                  >
                    <Sparkles size={16} />
                  </span>
                  <span>AI Career Assistant</span>
                </button>
              </div>
            </>
          )}
        </nav>

        {/* Settings + Sign Out, pinned to the bottom of the sidebar
            (outside the scrollable nav area, so they're always visible). */}
        <div className="border-t border-[var(--border)] px-3 py-4">
          <button
            onClick={handleNav.bind(null, 'settings')} // `.bind(null, 'settings')` pre-fills the 'settings' argument, so clicking this always navigates to Settings specifically
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
              currentView === 'settings'
                ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-all hover:bg-rose-500/10 hover:text-rose-400"
          >
            <LogOut size={18} />
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
      <div className="flex flex-1 flex-col lg:ml-64 min-w-0">
        {/* The top header bar — sticky, so it stays visible while
            scrolling through a long page. */}
        {/* This header is `sticky` and mounted for the whole session, so a
            live `backdrop-blur` here does force the browser to recomposite
            it on every animated-canvas frame underneath — that's what
            caused the earlier flicker (see the sidebar note below, which
            deliberately stays solid). Unlike the sidebar though, the
            header is a single small strip rather than a tall panel, and
            the particle canvas is already capped to ~30fps and paused off
            -screen (see ParticleBackground.tsx), so the recompositing
            cost here is small — this is the one deliberate exception
            where the frosted-glass look is worth that modest, contained cost. */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-base)]/70 backdrop-blur-xl backdrop-saturate-150 px-4 py-3.5 md:px-6">
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--accent)]/10 active:translate-y-0 active:scale-95"
                aria-label="Switch theme"
              >
                {/* The icon shown on the button itself matches whichever
                    theme is CURRENTLY active. */}
                {theme === 'dark' ? <Moon size={20} /> : theme === 'light' ? <Sun size={20} /> : <Palette size={20} />}
              </button>
              {activeMenu === 'theme' && (
                <div className="dropdown-panel absolute right-0 top-12 z-50 w-44 p-2 animate-slide-down" onClick={(e) => e.stopPropagation()}>
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

            {/* Profile button — a circular avatar (just the person's own
                uploaded photo, nothing else drawn on top of it). Clicking
                it opens a small popover (banner, avatar, name, email,
                branch, bio, skills) with its own "Edit profile" button
                that does the actual navigating — see the popover below. */}
            <div className="relative">
              <button
                ref={profileButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === 'profile' ? null : 'profile');
                }}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white transition-all active:scale-95"
                aria-label="Open your profile"
                aria-expanded={activeMenu === 'profile'}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </button>

              {/* Portal-rendered so this always paints above whatever page
                  is currently open (see AnchoredPortal.tsx) — a plain
                  `absolute` popover here could end up visually UNDER a
                  page's own high-z-index elements (e.g. a skills
                  autocomplete on the Profile edit page), which is what
                  made it look "ghosted"/see-through before. */}
              <AnchoredPortal open={activeMenu === 'profile'} anchorRef={profileButtonRef} onClose={() => setActiveMenu(null)}>
                <div className="profile-popover w-80 overflow-hidden animate-slide-down">
                  {/* Glowing banner strip behind the avatar — falls back to
                      a spotlight gradient in the theme's accent colors
                      when the person hasn't uploaded a cover image. */}
                  <div className="profile-popover-banner">
                    {profile?.banner_url && (
                      <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="px-4 pb-4">
                    {/* The avatar overlaps the banner above it (negative
                        margin) and sits opposite the Edit profile button. */}
                    <div className="-mt-8 flex items-end justify-between gap-3">
                      <div className="profile-popover-avatar flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-[var(--bg-elevated)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-lg font-bold text-white">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setActiveMenu(null);
                          onNavigate(role === 'company' ? 'company-profile' : 'profile');
                        }}
                        className="btn-ghost btn-sm"
                      >
                        Edit profile
                      </button>
                    </div>
                    <div className="mt-3">
                      <p className="truncate text-base font-bold text-[var(--text-primary)]">
                        {profile?.full_name || 'Your Profile'}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{profile?.email || ''}</p>
                      {profile?.branch && (
                        <p className="mt-2 text-xs font-medium text-[var(--accent)]">{profile.branch}</p>
                      )}
                    </div>
                    {profile?.bio && (
                      <p className="mt-3 line-clamp-3 text-sm leading-5 text-[var(--text-secondary)]">{profile.bio}</p>
                    )}
                    {profile?.skills && profile.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {profile.skills.slice(0, 6).map((s) => (
                          <span
                            key={s}
                            className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]"
                          >
                            {s}
                          </span>
                        ))}
                        {profile.skills.length > 6 && (
                          <span className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                            +{profile.skills.length - 6}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </AnchoredPortal>
            </div>
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
          <div key={currentView} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
