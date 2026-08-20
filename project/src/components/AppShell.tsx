// Classic glass shell — left sidebar (Discord-inspired), anti-flicker
import { useEffect, useState, memo, useMemo } from 'react';
import {
  LayoutDashboard, User, Upload, Target, FileText, Building2, Users, MessageSquare,
  Settings, LogOut, Briefcase, ScrollText, Sparkles, Menu, X, Moon, Sun, Palette,
  Calendar, Megaphone, FolderGit2, Bookmark, MessageCircle, Trophy, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme, type Theme } from '@/lib/theme';
import { useFeatureFlags } from '@/lib/featureFlags';
import { useSiteSettings } from '@/lib/siteSettings';
import { NotificationsBell } from '@/components/NotificationsBell';

export type ViewKey =
  | 'dashboard' | 'profile' | 'upload' | 'matches' | 'applications' | 'companies'
  | 'friends' | 'messages' | 'ai-assistant' | 'events' | 'announcements' | 'projects'
  | 'bookmarks' | 'forum' | 'leaderboard' | 'settings'
  | 'company-dashboard' | 'company-profile' | 'jobs' | 'applicants' | 'quizzes'
  | 'company-events' | 'company-announcements'
  | 'admin-dashboard' | 'admin-users' | 'admin-content' | 'admin-logs';

type NavItem = { view: ViewKey; label: string; icon: typeof LayoutDashboard };

const VIEW_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'AI-driven placement insights' },
  profile: { title: 'Profile', sub: 'Your public identity' },
  matches: { title: 'Matches', sub: 'Recommended opportunities' },
  companies: { title: 'Companies', sub: 'Browse organizations' },
  bookmarks: { title: 'Bookmarks', sub: 'Saved companies' },
  friends: { title: 'Friends', sub: 'Your network' },
  messages: { title: 'Messages', sub: 'Conversations' },
  upload: { title: 'Documents', sub: 'Resume & files' },
  applications: { title: 'Applications', sub: 'Track applications' },
  projects: { title: 'Projects', sub: 'Showcase your work' },
  events: { title: 'Events', sub: 'Upcoming events' },
  announcements: { title: 'Announcements', sub: 'Official notices' },
  forum: { title: 'Community Forum', sub: 'Discuss with peers' },
  leaderboard: { title: 'Leaderboard', sub: 'Top profiles' },
  'ai-assistant': { title: 'AI Career Assistant', sub: 'Your career guide' },
  settings: { title: 'Settings', sub: 'Appearance & account' },
  'company-dashboard': { title: 'Overview', sub: 'Hiring at a glance' },
  'company-profile': { title: 'Company Profile', sub: 'Public company page' },
  jobs: { title: 'Jobs', sub: 'Open roles' },
  applicants: { title: 'Applicants', sub: 'Incoming talent' },
  quizzes: { title: 'Quizzes', sub: 'Assessments' },
  'company-events': { title: 'Events', sub: 'Your events' },
  'company-announcements': { title: 'Announcements', sub: 'Your notices' },
};

const VIEW_FLAG: Partial<Record<ViewKey, string>> = {
  matches: 'matches', companies: 'companies', friends: 'friends', messages: 'messages',
  'ai-assistant': 'ai_assistant', events: 'events', announcements: 'announcements',
  forum: 'forum', leaderboard: 'leaderboard', quizzes: 'quizzes', jobs: 'jobs', applicants: 'applicants',
};

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

type Props = {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onSignOut: () => void;
  children: React.ReactNode;
};

const SidebarNav = memo(function SidebarNav({
  currentView,
  onNavigate,
  onSignOut,
  sidebarOpen,
  setSidebarOpen,
}: {
  currentView: ViewKey;
  onNavigate: (v: ViewKey) => void;
  onSignOut: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}) {
  const { profile } = useAuth();
  const flags = useFeatureFlags();
  const siteSettings = useSiteSettings();
  const role = profile?.role || 'student';

  const isViewEnabled = (view: ViewKey) => {
    const key = VIEW_FLAG[view];
    if (!key) return true;
    return flags[key] !== false;
  };

  const navItems = useMemo(() => {
    const base = role === 'company' ? COMPANY_NAV : STUDENT_NAV;
    return base.filter((i) => isViewEnabled(i.view));
  }, [role, flags]);

  const handleNav = (view: ViewKey) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  return (
    <aside
      className={`sidebar-glass fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300 ease-out lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] overflow-hidden flex-shrink-0">
          {siteSettings.logo_url ? (
            <img src={siteSettings.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Sparkles size={18} className="text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{siteSettings.site_name}</div>
          <div className="text-[11px] text-[var(--text-muted)]">AI Placement Portal</div>
        </div>
        <button type="button" onClick={() => setSidebarOpen(false)} className="lg:hidden text-[var(--text-muted)] p-1">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scroll-thin px-2.5 py-3">
        <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Main</p>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const active = currentView === item.view;
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => handleNav(item.view)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/25'
                    : 'text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  active ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--surface)] text-[var(--text-muted)]'
                }`}>
                  <Icon size={16} />
                </span>
                <span className="truncate flex-1 text-left">{item.label}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
              </button>
            );
          })}
        </div>

        {role !== 'company' && isViewEnabled('ai-assistant') && (
          <>
            <p className="px-2.5 mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Tools</p>
            <button
              type="button"
              onClick={() => handleNav('ai-assistant')}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors ${
                currentView === 'ai-assistant'
                  ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/25'
                  : 'text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-hover)]'
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                currentView === 'ai-assistant' ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--surface)] text-[var(--text-muted)]'
              }`}>
                <Sparkles size={16} />
              </span>
              AI Career Assistant
            </button>
          </>
        )}
      </nav>

      {/* Discord-style user panel */}
      <div className="border-t border-[var(--border)] p-2">
        <div className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-[var(--surface-hover)] transition-colors">
          <div className="relative flex-shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-[var(--border)]" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[11px] font-bold text-white">
                {(profile?.full_name || 'U').slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--bg-elevated)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{profile?.full_name || 'User'}</p>
            <p className="text-[11px] text-[var(--text-muted)] capitalize truncate">{profile?.role || 'student'}</p>
          </div>
          <button type="button" onClick={() => handleNav('settings')} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]" title="Settings">
            <Settings size={16} />
          </button>
          <button type="button" onClick={onSignOut} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-rose-500/15 hover:text-rose-400" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
});

function AppShellInner({ currentView, onNavigate, onSignOut, children }: Props) {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const role = profile?.role || 'student';
  const meta = VIEW_META[currentView] || { title: 'Dashboard', sub: '' };
  const initials = (profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  useEffect(() => {
    if (!themeOpen) return;
    const close = () => setThemeOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [themeOpen]);

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
      <SidebarNav
        currentView={currentView}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex flex-1 flex-col lg:ml-64 min-w-0">
        <header className="header-glass sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] lg:hidden"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[var(--text-primary)] truncate">{meta.title}</h1>
              <p className="hidden text-xs text-[var(--text-muted)] md:block truncate">{meta.sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setThemeOpen((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
              >
                {theme === 'light' ? <Sun size={18} /> : theme === 'dark' || theme === 'midnight' ? <Moon size={18} /> : <Palette size={18} />}
              </button>
              {themeOpen && (
                <div className="dropdown-panel absolute right-0 top-12 z-50 w-44 p-2">
                  {themeOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => { setTheme(opt.key); setThemeOpen(false); }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                          theme === opt.key ? 'bg-[var(--surface-hover)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <Icon size={16} />
                        {opt.label}
                        {theme === opt.key && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--accent)]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <NotificationsBell onNavigate={(v) => onNavigate(v as ViewKey)} open={notifOpen} onOpenChange={setNotifOpen} />

            <button
              type="button"
              onClick={() => onNavigate(role === 'company' ? 'company-profile' : 'profile')}
              className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] py-1.5 pl-1.5 pr-3 hover:border-[var(--accent)]"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xs font-bold text-white">
                  {initials}
                </div>
              )}
              <span className="hidden text-sm font-medium sm:block max-w-[120px] truncate">{profile?.full_name || 'User'}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export const AppShell = memo(AppShellInner);
