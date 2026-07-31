import { useEffect, useState } from 'react';
import {
  LayoutDashboard, User, Upload, Target, FileText, Building2, Users, MessageSquare,
  Settings, LogOut, Briefcase, ScrollText, Sparkles, Menu, X, Moon, Sun, Palette,
  Calendar, Megaphone, FolderGit2, Bookmark, MessageCircle, Trophy, FolderKanban,
  ShieldCheck, UserCog, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme, type Theme } from '@/lib/theme';
import { NotificationsBell } from '@/components/NotificationsBell';

export type ViewKey =
  | 'dashboard' | 'profile' | 'upload' | 'matches' | 'applications'
  | 'companies' | 'company-public' | 'messages' | 'friends'
  | 'settings' | 'company-dashboard' | 'company-profile' | 'jobs' | 'applicants'
  | 'ai-assistant' | 'events' | 'announcements' | 'projects' | 'bookmarks'
  | 'forum' | 'leaderboard' | 'company-events' | 'company-announcements'
  | 'admin-dashboard' | 'admin-users' | 'admin-content' | 'admin-logs';

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

type NavItem = {
  view: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: ('student' | 'company' | 'admin')[];
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
  { view: 'company-events', label: 'Events', icon: Calendar },
  { view: 'company-announcements', label: 'Announcements', icon: Megaphone },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'forum', label: 'Community Forum', icon: MessageCircle },
];

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
  children: React.ReactNode;
};

export function AppShell({ currentView, onNavigate, onSignOut, children }: Props) {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'theme' | 'notifications' | null>(null);

  const role = profile?.role || 'student';
  const navItems = role === 'company' ? COMPANY_NAV : STUDENT_NAV;
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
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--border)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex-shrink-0">
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[var(--text-primary)] truncate">SmartCell</div>
            <div className="text-xs text-[var(--text-muted)]">AI Placement Portal</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-[var(--text-muted)]">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-4">
          <span className="px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Main</span>
          <div className="mt-2 space-y-1">
            {navItems.map((item) => {
              const isActive = currentView === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => handleNav(item.view)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/30'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                </button>
              );
            })}
          </div>

          {role === 'student' && (
            <>
              <span className="mt-6 block px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Tools</span>
              <div className="mt-2 space-y-1">
                <button
                  onClick={() => handleNav('ai-assistant')}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    currentView === 'ai-assistant'
                      ? 'bg-gradient-to-r from-[var(--accent)]/15 to-[var(--accent-2)]/10 text-[var(--accent)] border border-[var(--accent)]/30'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Sparkles size={18} className="flex-shrink-0" />
                  <span>AI Career Assistant</span>
                </button>
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-[var(--border)] px-3 py-4">
          <button
            onClick={handleNav.bind(null, 'settings')}
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

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:ml-64 min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-base)]/70 backdrop-blur-xl px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)] md:text-xl">{meta.title}</h1>
              <p className="hidden text-xs text-[var(--text-muted)] md:block">{meta.sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(activeMenu === 'theme' ? null : 'theme');
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)]"
                aria-label="Switch theme"
              >
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

            <NotificationsBell
              onNavigate={(v) => onNavigate(v as ViewKey)}
              open={activeMenu === 'notifications'}
              onOpenChange={(v) => setActiveMenu(v ? 'notifications' : null)}
            />

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
              <span className="hidden text-sm font-medium text-[var(--text-primary)] sm:block max-w-[120px] truncate">
                {profile?.full_name || 'User'}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div key={currentView} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
