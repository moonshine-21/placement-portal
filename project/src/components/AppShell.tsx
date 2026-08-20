// LUMEN / AETHER shell — compact system control, no giant nav bars
import { useEffect, useState, memo, useMemo } from 'react';
import {
  LayoutDashboard, User, Upload, Target, FileText, Building2, Users, MessageSquare,
  Settings, LogOut, Briefcase, ScrollText, Sparkles, Moon, Sun, Palette,
  Calendar, Megaphone, FolderGit2, Bookmark, MessageCircle, Trophy, ClipboardList, Command,
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
  dashboard: { title: 'Environment', sub: 'Aether online' },
  profile: { title: 'Identity', sub: 'Your signal' },
  matches: { title: 'Matches', sub: 'Opportunity field' },
  companies: { title: 'Companies', sub: 'Organizations' },
  bookmarks: { title: 'Saved', sub: 'Bookmarks' },
  friends: { title: 'Circle', sub: 'Network' },
  messages: { title: 'Messages', sub: 'Comms' },
  upload: { title: 'Documents', sub: 'Files' },
  applications: { title: 'Applications', sub: 'Pipeline' },
  projects: { title: 'Projects', sub: 'Work' },
  events: { title: 'Events', sub: 'Schedule' },
  announcements: { title: 'News', sub: 'Notices' },
  forum: { title: 'Forum', sub: 'Community' },
  leaderboard: { title: 'Ranks', sub: 'Standing' },
  'ai-assistant': { title: 'Guide', sub: 'Assistant' },
  settings: { title: 'Settings', sub: 'System' },
  'company-dashboard': { title: 'Overview', sub: 'Hiring pulse' },
  'company-profile': { title: 'Company', sub: 'Profile' },
  jobs: { title: 'Jobs', sub: 'Roles' },
  applicants: { title: 'Talent', sub: 'Applicants' },
  quizzes: { title: 'Quizzes', sub: 'Assessments' },
  'company-events': { title: 'Events', sub: 'Schedule' },
  'company-announcements': { title: 'News', sub: 'Notices' },
};

const VIEW_FLAG: Partial<Record<ViewKey, string>> = {
  matches: 'matches', companies: 'companies', friends: 'friends', messages: 'messages',
  'ai-assistant': 'ai_assistant', events: 'events', announcements: 'announcements',
  forum: 'forum', leaderboard: 'leaderboard', quizzes: 'quizzes', jobs: 'jobs', applicants: 'applicants',
};

const STUDENT_NAV: NavItem[] = [
  { view: 'dashboard', label: 'Environment', icon: LayoutDashboard },
  { view: 'profile', label: 'Identity', icon: User },
  { view: 'matches', label: 'Matches', icon: Target },
  { view: 'companies', label: 'Companies', icon: Building2 },
  { view: 'applications', label: 'Applications', icon: FileText },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'friends', label: 'Circle', icon: Users },
  { view: 'projects', label: 'Projects', icon: FolderGit2 },
  { view: 'events', label: 'Events', icon: Calendar },
  { view: 'settings', label: 'Settings', icon: Settings },
];

const COMPANY_NAV: NavItem[] = [
  { view: 'company-dashboard', label: 'Overview', icon: LayoutDashboard },
  { view: 'company-profile', label: 'Company', icon: Building2 },
  { view: 'jobs', label: 'Jobs', icon: Briefcase },
  { view: 'applicants', label: 'Talent', icon: ScrollText },
  { view: 'quizzes', label: 'Quizzes', icon: ClipboardList },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'settings', label: 'Settings', icon: Settings },
];

type Props = {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onSignOut: () => void;
  children: React.ReactNode;
};

function AppShellInner({ currentView, onNavigate, onSignOut, children }: Props) {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const flags = useFeatureFlags();
  const siteSettings = useSiteSettings();
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const role = profile?.role || 'student';
  const meta = VIEW_META[currentView] || { title: 'Environment', sub: '' };
  const initials = (profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  const isViewEnabled = (view: ViewKey) => {
    const flagKey = VIEW_FLAG[view];
    if (!flagKey) return true;
    return flags[flagKey] !== false;
  };

  const navItems = useMemo(() => {
    const base = role === 'company' ? COMPANY_NAV : STUDENT_NAV;
    return base.filter((i) => isViewEnabled(i.view));
  }, [role, flags]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!themeOpen) return;
    const close = () => setThemeOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [themeOpen]);

  const themeOptions: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: 'dark', label: 'Charcoal', icon: Moon },
    { key: 'light', label: 'Paper', icon: Sun },
    { key: 'sunset', label: 'Copper', icon: Palette },
    { key: 'midnight', label: 'Steel', icon: Moon },
    { key: 'ocean', label: 'Moss', icon: Palette },
    { key: 'aurora', label: 'Violet', icon: Palette },
  ];

  return (
    <div className="lumen-root">
      <header className="lumen-top">
        <div className="lumen-brand">
          <span className="lumen-brand-mark" />
          <span className="lumen-brand-name">{siteSettings.site_name || 'Placement'}</span>
          <span className="lumen-divider" />
          <div>
            <div className="lumen-stage-title">{meta.title}</div>
            <div className="lumen-stage-sub">{meta.sub}</div>
          </div>
        </div>

        <div className="lumen-top-actions">
          <button type="button" className="lumen-icon-btn" onClick={() => setCmdOpen(true)} title="Command (Ctrl+K)">
            <Command size={16} />
          </button>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="lumen-icon-btn" onClick={() => setThemeOpen((v) => !v)}>
              {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {themeOpen && (
              <div className="dropdown-panel absolute right-0 top-10 z-50 w-40 p-1.5">
                {themeOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => { setTheme(opt.key); setThemeOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs ${
                        theme === opt.key ? 'text-[var(--copper)] bg-[var(--copper-soft)]' : 'text-[var(--bone-dim)]'
                      }`}
                    >
                      <Icon size={14} /> {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <NotificationsBell onNavigate={(v) => onNavigate(v as ViewKey)} open={notifOpen} onOpenChange={setNotifOpen} />

          <button
            type="button"
            className="lumen-identity"
            onClick={() => onNavigate(role === 'company' ? 'company-profile' : 'profile')}
          >
            {avatarUrl ? <img src={avatarUrl} alt="" className="lumen-avatar" /> : <span className="lumen-avatar">{initials}</span>}
            <span className="lumen-identity-name">{profile?.full_name || 'You'}</span>
          </button>

          <button type="button" className="lumen-icon-btn" onClick={onSignOut} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="lumen-stage lumen-stage-flush">{children}</main>

      {cmdOpen && (
        <div className="cmd-overlay" onClick={() => setCmdOpen(false)}>
          <div className="cmd-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command">
            <p className="cmd-title">Navigate</p>
            <div className="cmd-list">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.view}
                    type="button"
                    className={`cmd-item${currentView === item.view ? ' is-active' : ''}`}
                    onClick={() => { onNavigate(item.view); setCmdOpen(false); }}
                  >
                    <Icon size={15} />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="cmd-hint">Esc to close · Ctrl/Cmd+K to toggle</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const AppShell = memo(AppShellInner);
