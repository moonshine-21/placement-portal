// ============================================================================
// src/components/AppShell.tsx
// Premium glass shell: thin icon rail + translucent top bar + content stage
// Matches the reference design language (Channel Analytics / education dashboards)
// ============================================================================

import { useEffect, useState } from 'react';
import {
  LayoutDashboard, User, Upload, Target, FileText, Building2, Users, MessageSquare,
  Settings, LogOut, Briefcase, ScrollText, Sparkles, Menu, X, Moon, Sun, Palette,
  Calendar, Megaphone, FolderGit2, Bookmark, MessageCircle, Trophy, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme, type Theme } from '@/lib/theme';
import { useFeatureFlags, useFeatureFlagsLoaded } from '@/lib/featureFlags';
import { useSiteSettings } from '@/lib/siteSettings';
import { NotificationsBell } from '@/components/NotificationsBell';

export type ViewKey =
  | 'dashboard' | 'profile' | 'upload' | 'matches' | 'applications'
  | 'companies' | 'company-public' | 'messages' | 'friends'
  | 'settings' | 'company-dashboard' | 'company-profile' | 'jobs' | 'applicants' | 'quizzes'
  | 'ai-assistant' | 'events' | 'announcements' | 'projects' | 'bookmarks'
  | 'forum' | 'leaderboard' | 'company-events' | 'company-announcements'
  | 'admin-dashboard' | 'admin-users' | 'admin-content' | 'admin-logs';

const VIEW_META: Record<ViewKey, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'AI-driven placement insights' },
  profile: { title: 'Profile', sub: 'Academic & skills profile' },
  upload: { title: 'Upload Documents', sub: 'Resume & documents' },
  matches: { title: 'Matches', sub: 'Companies matched to you' },
  applications: { title: 'Applications', sub: 'Track your applications' },
  companies: { title: 'Companies', sub: 'Browse & apply' },
  'company-public': { title: 'Company Profile', sub: 'Company details' },
  messages: { title: 'Messages', sub: 'Direct messages' },
  friends: { title: 'Friends', sub: 'Connect with peers' },
  settings: { title: 'Settings', sub: 'Appearance & account' },
  'company-dashboard': { title: 'Overview', sub: 'Hiring overview' },
  'company-profile': { title: 'Company Profile', sub: 'Public profile' },
  jobs: { title: 'Jobs', sub: 'Open positions' },
  applicants: { title: 'Applicants', sub: 'Application pipeline' },
  quizzes: { title: 'Quizzes', sub: 'Assess applicants' },
  'ai-assistant': { title: 'AI Career Assistant', sub: 'Your personal guide' },
  events: { title: 'Events', sub: 'Drives & workshops' },
  announcements: { title: 'Announcements', sub: 'Latest updates' },
  projects: { title: 'Projects', sub: 'Portfolio showcase' },
  bookmarks: { title: 'Bookmarks', sub: 'Saved companies' },
  forum: { title: 'Forum', sub: 'Community discussion' },
  leaderboard: { title: 'Leaderboard', sub: 'Top students' },
  'company-events': { title: 'Events', sub: 'Host events' },
  'company-announcements': { title: 'Announcements', sub: 'Post updates' },
  'admin-dashboard': { title: 'Admin', sub: 'Platform overview' },
  'admin-users': { title: 'Users', sub: 'User management' },
  'admin-content': { title: 'Content', sub: 'Moderation' },
  'admin-logs': { title: 'Logs', sub: 'Audit trail' },
};

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

type NavItem = {
  view: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
};

const STUDENT_NAV: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'profile', label: 'Profile', icon: User },
  { view: 'matches', label: 'Matches', icon: Target },
  { view: 'companies', label: 'Companies', icon: Building2 },
  { view: 'applications', label: 'Applications', icon: FileText },
  { view: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { view: 'projects', label: 'Projects', icon: FolderGit2 },
  { view: 'events', label: 'Events', icon: Calendar },
  { view: 'announcements', label: 'Announcements', icon: Megaphone },
  { view: 'friends', label: 'Friends', icon: Users },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'forum', label: 'Forum', icon: MessageCircle },
  { view: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { view: 'upload', label: 'Upload', icon: Upload },
];

const COMPANY_NAV: NavItem[] = [
  { view: 'company-dashboard', label: 'Overview', icon: LayoutDashboard },
  { view: 'company-profile', label: 'Profile', icon: Building2 },
  { view: 'jobs', label: 'Jobs', icon: Briefcase },
  { view: 'applicants', label: 'Applicants', icon: ScrollText },
  { view: 'quizzes', label: 'Quizzes', icon: ClipboardList },
  { view: 'company-events', label: 'Events', icon: Calendar },
  { view: 'company-announcements', label: 'Announcements', icon: Megaphone },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'forum', label: 'Forum', icon: MessageCircle },
];

type Props = {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onSignOut: () => void;
  children: React.ReactNode;
};

export function AppShell({ currentView, onNavigate, onSignOut, children }: Props) {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const flags = useFeatureFlags();
  const flagsLoaded = useFeatureFlagsLoaded();
  const siteSettings = useSiteSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'theme' | null>(null);

  const isViewEnabled = (view: ViewKey) => {
    const flagKey = VIEW_FLAG[view];
    if (!flagKey) return true;
    if (!flagsLoaded) return false;
    return flags[flagKey] !== false;
  };

  const role = profile?.role || 'student';
  const navItems = (role === 'company' ? COMPANY_NAV : STUDENT_NAV).filter((item) => isViewEnabled(item.view));
  const meta = VIEW_META[currentView] || { title: 'Dashboard', sub: '' };

  const initials = (profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  const handleNav = (view: ViewKey) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!activeMenu) return;
    const close = () => setActiveMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [activeMenu]);

  const themeOptions: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: 'dark', label: 'Dark', icon: Moon },
    { key: 'light', label: 'Light', icon: Sun },
    { key: 'aurora', label: 'Aurora', icon: Palette },
  ];

  return (
    <div className="flex min-h-screen">
      {/* ===== Thin Icon Rail (desktop) / Drawer (mobile) ===== */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 ease-[var(--ease)]
          w-[72px] border-r border-[var(--border)]
          bg-[var(--bg-elevated)]/70 backdrop-blur-2xl
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-[var(--border)] flex-shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] overflow-hidden shadow-lg shadow-[var(--accent-glow)]">
            {siteSettings.logo_url ? (
              <img src={siteSettings.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Sparkles size={18} className="text-white" />
            )}
          </div>
          {sidebarOpen && (
            <div className="ml-3 min-w-0 lg:hidden">
              <div className="font-semibold text-sm truncate">{siteSettings.site_name || 'Placement'}</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto mr-3 lg:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav icons */}
        <nav className="flex-1 overflow-y-auto py-4 flex flex-col items-center gap-1 px-2">
          {navItems.map((item) => {
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                title={item.label}
                className={`
                  group relative flex items-center justify-center
                  h-11 w-11 rounded-xl transition-all duration-200
                  ${isActive
                    ? 'bg-[var(--glass-active)] text-[var(--accent)] shadow-[0_0_0_1px_var(--border-glow)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--glass-secondary)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                {/* Tooltip on desktop */}
                <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg bg-[var(--glass-solid)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] opacity-0 shadow-lg border border-[var(--border-strong)] transition-opacity group-hover:opacity-100 lg:block hidden">
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* AI Assistant (students only) */}
          {role !== 'company' && isViewEnabled('ai-assistant') && (
            <button
              onClick={() => handleNav('ai-assistant')}
              title="AI Career Assistant"
              className={`
                group relative flex items-center justify-center mt-2
                h-11 w-11 rounded-xl transition-all duration-200
                ${currentView === 'ai-assistant'
                  ? 'bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-2)]/20 text-[var(--accent)] shadow-[0_0_0_1px_var(--border-glow)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--glass-secondary)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              <Sparkles size={20} strokeWidth={currentView === 'ai-assistant' ? 2.25 : 1.75} />
              <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg bg-[var(--glass-solid)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] opacity-0 shadow-lg border border-[var(--border-strong)] transition-opacity group-hover:opacity-100 lg:block hidden">
                AI Assistant
              </span>
            </button>
          )}
        </nav>

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-1 px-2 pb-4 border-t border-[var(--border)] pt-3">
          <button
            onClick={() => handleNav('settings')}
            title="Settings"
            className={`
              flex items-center justify-center h-11 w-11 rounded-xl transition-all
              ${currentView === 'settings'
                ? 'bg-[var(--glass-active)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--glass-secondary)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            <Settings size={20} />
          </button>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="flex items-center justify-center h-11 w-11 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--error)]/10 hover:text-[var(--error)] transition-all"
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ===== Main Stage ===== */}
      <div className="flex flex-1 flex-col min-w-0 lg:pl-[72px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-elevated)]/60 backdrop-blur-2xl px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--glass-secondary)]"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight truncate">{meta.title}</h1>
            <p className="text-xs text-[var(--text-muted)] truncate hidden sm:block">{meta.sub}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme switcher */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === 'theme' ? null : 'theme');
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--glass-secondary)] hover:text-[var(--text-primary)] transition-all"
              >
                {theme === 'light' ? <Sun size={18} /> : theme === 'aurora' ? <Palette size={18} /> : <Moon size={18} />}
              </button>
              {activeMenu === 'theme' && (
                <div className="dropdown-panel absolute right-0 top-12 w-40 py-1.5 z-50">
                  {themeOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setTheme(opt.key);
                        setActiveMenu(null);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                        theme === opt.key
                          ? 'text-[var(--accent)] bg-[var(--glass-active)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--glass-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <opt.icon size={16} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <NotificationsBell />

            {/* Avatar */}
            <button
              onClick={() => handleNav('profile')}
              className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden border border-[var(--border-strong)] hover:border-[var(--accent)] transition-all bg-[var(--glass-secondary)]"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-[var(--text-secondary)]">{initials}</span>
              )}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
