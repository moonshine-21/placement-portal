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
// ANTI-FLICKER NOTES:
//   1. SidebarNav stays memoized so page data renders do not rebuild the
//      navigation tree unnecessarily.
//   2. The sidebar itself never uses backdrop-filter.
//   3. The main glass effect comes from one fixed glass stage under the
//      scrolling content, so the animated particle layer is sampled once
//      by a stable surface instead of by every card on every frame.
//   4. The active state belongs to the actual nav button; there is no
//      moving absolute-positioned active pill.
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
// "SIGNAL" — Discord-style navigation.
// The active state is rendered directly on the selected button; there is no
// separate moving highlight element.
//
// ============================================================================
const NavRow = memo(function NavRow({
  view, label, icon: Icon, isActive, onClick,
}: { view: ViewKey; label: string; icon: typeof LayoutDashboard; isActive: boolean; onClick: (view: ViewKey) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(view)}
      aria-current={isActive ? 'page' : undefined}
      className={`nav-row group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${isActive ? 'nav-row-active' : ''}`}
    >
      <span className="nav-icon" aria-hidden="true">
        <Icon size={17} strokeWidth={isActive ? 2.2 : 1.9} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {label}
      </span>
      {isActive && <span className="nav-active-dot" aria-hidden="true" />}
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
    return !flagKey || flags[flagKey] !== false;
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
      className={`app-sidebar fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
      aria-label="Primary navigation"
    >
      <div className="sidebar-brand">
        <div className="brand-mark">
          {siteSettings.logo_url ? (
            <img src={siteSettings.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            siteSettings.site_name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{siteSettings.site_name}</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">Placement workspace</div>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="icon-button lg:hidden"
          aria-label="Close navigation"
        >
          <X size={17} />
        </button>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav flex-1 overflow-y-auto px-3 py-3" aria-label="Workspace">
        <div className="sidebar-section-label">WORKSPACE</div>
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavRow
              key={item.view}
              view={item.view}
              label={item.label}
              icon={item.icon}
              isActive={currentView === item.view}
              onClick={handleNav}
            />
          ))}
        </div>

        {role !== 'company' && isViewEnabled('ai-assistant') && (
          <>
            <div className="sidebar-section-label mt-6">TOOLS</div>
            <NavRow
              view="ai-assistant"
              label="AI Career Assistant"
              icon={ScrollText}
              isActive={currentView === 'ai-assistant'}
              onClick={handleNav}
            />
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          onClick={() => handleNav(role === 'company' ? 'company-profile' : 'profile')}
          className="user-card group"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <div className="avatar-fallback">{initials}</div>
          )}
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{profile?.full_name || 'User'}</span>
            <span className="block truncate text-[11px] capitalize text-[var(--text-muted)]">{role}</span>
          </span>
          <span className="online-dot" aria-label="Online" />
        </button>
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleNav('settings')}
            className={`footer-link ${currentView === 'settings' ? 'text-[var(--accent)]' : ''}`}
          >
            Settings
          </button>
          <span className="text-[var(--border-strong)]">·</span>
          <button type="button" onClick={onSignOut} className="footer-link hover:!text-[var(--error)]">Sign out</button>
        </div>
      </div>
    </aside>
  );
});

function AppShell({ currentView, onNavigate, onSignOut, children }: Props) {
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'theme' | 'notifications' | 'profile' | null>(null);
  const { profile } = useAuth();
  const role = profile?.role === 'company' ? 'company' : 'student';
  const meta = VIEW_META[currentView] || { title: 'Dashboard', sub: '' };

  const posLabel = (() => {
    const list = STUDENT_NAV.some((i) => i.view === currentView) ? STUDENT_NAV : COMPANY_NAV;
    const idx = list.findIndex((i) => i.view === currentView);
    return idx >= 0 ? `${String(idx + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}` : null;
  })();

  useEffect(() => {
    if (!activeMenu) return;
    const close = () => setActiveMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [activeMenu]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setActiveMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const themeOptions: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: 'dark', label: 'Dark', icon: Moon },
    { key: 'light', label: 'Light', icon: Sun },
    { key: 'aurora', label: 'Aurora', icon: Palette },
    { key: 'midnight', label: 'Midnight', icon: Moon },
    { key: 'sunset', label: 'Sunset', icon: Palette },
    { key: 'ocean', label: 'Ocean', icon: Palette },
  ];

  return (
    <div className="app-shell" data-ui-shell="stable">
      <SidebarNav
        currentView={currentView}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {sidebarOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop lg:hidden"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="app-main">
        <div className="app-main-glass" aria-hidden="true" />
        <header className="app-header">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="icon-button lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {posLabel && <span className="page-index">{posLabel}</span>}
                <h1 className="truncate text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)] md:text-xl">{meta.title}</h1>
              </div>
              <p className="mt-0.5 hidden truncate text-xs text-[var(--text-muted)] md:block">{meta.sub}</p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === 'theme' ? null : 'theme');
                }}
                className="icon-button"
                aria-label="Switch theme"
                aria-expanded={activeMenu === 'theme'}
              >
                {theme === 'light' ? <Sun size={18} /> : theme === 'dark' || theme === 'midnight' ? <Moon size={18} /> : <Palette size={18} />}
              </button>
              {activeMenu === 'theme' && (
                <div className="dropdown-panel absolute right-0 top-11 z-[60] w-48 p-2 animate-slide-down" onClick={(e) => e.stopPropagation()}>
                  {themeOptions.map((opt) => (
                    <button
                      type="button"
                      key={opt.key}
                      onClick={() => { setTheme(opt.key); setActiveMenu(null); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${theme === opt.key ? 'bg-[var(--surface-hover)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
                    >
                      <opt.icon size={16} />
                      {opt.label}
                      {theme === opt.key && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <NotificationsBell
              onNavigate={(v) => onNavigate(v as ViewKey)}
              open={activeMenu === 'notifications'}
              onOpenChange={(v) => setActiveMenu(v ? 'notifications' : null)}
            />

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === 'profile' ? null : 'profile');
                }}
                className="profile-trigger"
                aria-label="Open your profile"
                aria-expanded={activeMenu === 'profile'}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span>{(profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase()}</span>
                )}
                <span className="profile-online-dot" />
              </button>

              {activeMenu === 'profile' && (
                <div className="profile-popover absolute right-0 top-12 z-[60] w-[320px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="profile-popover-banner">
                    {profile?.banner_url ? (
                      <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="profile-popover-banner-fallback" />
                    )}
                  </div>
                  <div className="px-4 pb-4">
                    <div className="-mt-8 flex items-end justify-between gap-3">
                      <div className="profile-popover-avatar">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span>{(profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setActiveMenu(null); onNavigate(role === 'company' ? 'company-profile' : 'profile'); }}
                        className="btn-ghost btn-sm"
                      >
                        Edit profile
                      </button>
                    </div>
                    <div className="mt-3">
                      <p className="truncate text-base font-bold text-[var(--text-primary)]">{profile?.full_name || 'Your Profile'}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{profile?.email || ''}</p>
                      {profile?.branch && <p className="mt-2 text-xs font-medium text-[var(--accent)]">{profile.branch}</p>}
                    </div>
                    {profile?.bio && (
                      <p className="mt-3 line-clamp-3 text-sm leading-5 text-[var(--text-secondary)]">{profile.bio}</p>
                    )}
                    {profile?.skills && profile.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {profile.skills.slice(0, 6).map((skill) => (
                          <span key={skill} className="profile-skill-chip">{skill}</span>
                        ))}
                        {profile.skills.length > 6 && <span className="profile-skill-chip">+{profile.skills.length - 6}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-content">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

const AppShellMemo = memo(AppShell);
export { AppShellMemo as AppShell };
