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
  ];

  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      {/* ---------- Discord + macOS style sidebar ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#0f0f12]/95 backdrop-blur-2xl border-r border-white/[0.06] transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ boxShadow: '4px 0 24px rgba(0,0,0,0.25)' }}
      >
        {/* Brand header — macOS traffic-light feel + site name */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex-shrink-0 overflow-hidden shadow-lg shadow-[var(--accent)]/20">
            {siteSettings.logo_url ? (
              <img src={siteSettings.logo_url} alt={siteSettings.site_name} className="h-full w-full object-cover" />
            ) : (
              <Sparkles size={18} className="text-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-white/95 truncate tracking-tight">{siteSettings.site_name}</div>
            <div className="text-[11px] text-white/40 truncate">AI Placement Portal</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-white/[0.06]" />

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scroll-thin">
          <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Main</p>
          {navItems.map((item) => {
            const active = currentView === item.view;
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                className={`group relative flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90'
                }`}
              >
                {/* Discord-style active indicator bar */}
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[var(--accent)]" />
                )}
                <span className={`flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors ${
                  active ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-white/45 group-hover:text-white/70'
                }`}>
                  <Icon size={17} strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Tools section for AI assistant when available */}
          {role !== 'company' && isViewEnabled('ai-assistant') && (
            <>
              <p className="px-2.5 mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Tools</p>
              <button
                onClick={() => handleNav('ai-assistant')}
                className={`group relative flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ${
                  currentView === 'ai-assistant'
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90'
                }`}
              >
                {currentView === 'ai-assistant' && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[var(--accent)]" />
                )}
                <span className={`flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors ${
                  currentView === 'ai-assistant' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-white/45 group-hover:text-white/70'
                }`}>
                  <Sparkles size={17} strokeWidth={currentView === 'ai-assistant' ? 2.25 : 1.75} />
                </span>
                <span className="truncate">AI Career Assistant</span>
              </button>
            </>
          )}
        </nav>

        {/* Bottom user panel — Discord style */}
        <div className="border-t border-white/[0.06] p-2">
          <div className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 hover:bg-white/[0.04] transition-colors">
            <div className="relative flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/10" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[11px] font-bold text-white ring-2 ring-white/10">
                  {initials}
                </div>
              )}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0f0f12]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white/90 truncate leading-tight">{profile?.full_name || 'User'}</p>
              <p className="text-[11px] text-white/35 truncate leading-tight capitalize">{profile?.role || 'student'}</p>
            </div>
            <button
              onClick={() => handleNav('settings')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors"
              title="Settings"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={onSignOut}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ---------- Main content ---------- */}
      <div className="flex flex-1 flex-col lg:ml-[260px] min-w-0">
        {/* macOS-style top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-[var(--bg-base)]/80 backdrop-blur-xl px-4 py-3 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/60 lg:hidden hover:bg-white/[0.08] transition-colors"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight truncate">{meta.title}</h1>
              <p className="hidden text-[12px] text-[var(--text-muted)] md:block truncate">{meta.sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Theme switcher */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setActiveMenu(activeMenu === 'theme' ? null : 'theme')}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
                title="Theme"
              >
                {theme === 'light' ? <Sun size={17} /> : theme === 'aurora' ? <Palette size={17} /> : <Moon size={17} />}
              </button>
              {activeMenu === 'theme' && (
                <div className="absolute right-0 top-full mt-1.5 w-40 rounded-xl border border-white/[0.08] bg-[#1a1a1e]/95 backdrop-blur-xl p-1.5 shadow-2xl animate-fade-in-scale z-50">
                  {themeOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => { setTheme(opt.key); setActiveMenu(null); }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                          theme === opt.key ? 'bg-white/[0.08] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white/90'
                        }`}
                      >
                        <Icon size={15} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <NotificationsBell />

            <button
              onClick={() => handleNav(role === 'company' ? 'company-profile' : 'profile')}
              className="ml-1 flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] pl-1 pr-2.5 py-1 hover:bg-white/[0.08] transition-colors"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[10px] font-bold text-white">
                  {initials}
                </div>
              )}
              <span className="hidden text-[12px] font-medium text-[var(--text-primary)] sm:block max-w-[100px] truncate">
                {profile?.full_name || 'User'}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="min-h-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
