// ============================================================================
// LUMEN STAGE shell — Intent Spine navigation (no left sidebar)
// ============================================================================

import { useEffect, useState, memo, useMemo } from 'react';
import {
  LayoutDashboard, User, Upload, Target, FileText, Building2, Users, MessageSquare,
  Settings, LogOut, Briefcase, ScrollText, Sparkles, Moon, Sun, Palette,
  Calendar, Megaphone, FolderGit2, Bookmark, MessageCircle, Trophy,
  ShieldCheck, UserCog, ClipboardList,
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

type NavItem = {
  view: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
};

const VIEW_META: Record<ViewKey, { title: string; sub: string }> = {
  dashboard: { title: 'Stage', sub: 'Your placement signal' },
  profile: { title: 'Identity', sub: 'How recruiters see you' },
  matches: { title: 'Matches', sub: 'Where you fit' },
  companies: { title: 'Companies', sub: 'Explore organizations' },
  bookmarks: { title: 'Saved', sub: 'Bookmarked companies' },
  friends: { title: 'Circle', sub: 'Your network' },
  messages: { title: 'Messages', sub: 'Conversations' },
  upload: { title: 'Documents', sub: 'Resume & files' },
  applications: { title: 'Applications', sub: 'Where you applied' },
  projects: { title: 'Projects', sub: 'Work you have shipped' },
  events: { title: 'Events', sub: 'Upcoming campus events' },
  announcements: { title: 'Announcements', sub: 'Official notices' },
  forum: { title: 'Forum', sub: 'Community discussion' },
  leaderboard: { title: 'Leaderboard', sub: 'Top profiles' },
  'ai-assistant': { title: 'Guide', sub: 'Career assistant' },
  settings: { title: 'Settings', sub: 'Appearance & account' },
  'company-dashboard': { title: 'Overview', sub: 'Hiring pulse' },
  'company-profile': { title: 'Company', sub: 'Public profile' },
  jobs: { title: 'Jobs', sub: 'Open roles' },
  applicants: { title: 'Applicants', sub: 'Incoming talent' },
  quizzes: { title: 'Quizzes', sub: 'Assessments' },
  'company-events': { title: 'Events', sub: 'Your events' },
  'company-announcements': { title: 'Announcements', sub: 'Your notices' },
  'admin-dashboard': { title: 'Admin', sub: 'System overview' },
  'admin-users': { title: 'Users', sub: 'Manage accounts' },
  'admin-content': { title: 'Content', sub: 'Moderation' },
  'admin-logs': { title: 'Logs', sub: 'Audit trail' },
};

const VIEW_FLAG: Partial<Record<ViewKey, string>> = {
  matches: 'matches',
  companies: 'companies',
  friends: 'friends',
  messages: 'messages',
  'ai-assistant': 'ai_assistant',
  events: 'events',
  announcements: 'announcements',
  forum: 'forum',
  leaderboard: 'leaderboard',
  quizzes: 'quizzes',
  jobs: 'jobs',
  applicants: 'applicants',
};

const STUDENT_NAV: NavItem[] = [
  { view: 'dashboard', label: 'Stage', icon: LayoutDashboard },
  { view: 'profile', label: 'Identity', icon: User },
  { view: 'matches', label: 'Matches', icon: Target },
  { view: 'companies', label: 'Companies', icon: Building2 },
  { view: 'bookmarks', label: 'Saved', icon: Bookmark },
  { view: 'friends', label: 'Circle', icon: Users },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'upload', label: 'Docs', icon: Upload },
  { view: 'applications', label: 'Apps', icon: FileText },
  { view: 'projects', label: 'Projects', icon: FolderGit2 },
  { view: 'events', label: 'Events', icon: Calendar },
  { view: 'announcements', label: 'News', icon: Megaphone },
  { view: 'forum', label: 'Forum', icon: MessageCircle },
  { view: 'leaderboard', label: 'Ranks', icon: Trophy },
];

const COMPANY_NAV: NavItem[] = [
  { view: 'company-dashboard', label: 'Overview', icon: LayoutDashboard },
  { view: 'company-profile', label: 'Company', icon: Building2 },
  { view: 'jobs', label: 'Jobs', icon: Briefcase },
  { view: 'applicants', label: 'Talent', icon: ScrollText },
  { view: 'quizzes', label: 'Quizzes', icon: ClipboardList },
  { view: 'company-events', label: 'Events', icon: Calendar },
  { view: 'company-announcements', label: 'News', icon: Megaphone },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'forum', label: 'Forum', icon: MessageCircle },
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

  const role = profile?.role || 'student';
  const meta = VIEW_META[currentView] || { title: 'Stage', sub: '' };
  const initials = (profile?.full_name || profile?.email || 'U').slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  const isViewEnabled = (view: ViewKey) => {
    const flagKey = VIEW_FLAG[view];
    if (!flagKey) return true;
    return flags[flagKey] !== false;
  };

  const navItems = useMemo(() => {
    const base = role === 'company' ? COMPANY_NAV : STUDENT_NAV;
    return base.filter((item) => isViewEnabled(item.view));
  }, [role, flags]);

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
      {/* Top identity bar — not a traditional navbar */}
      <header className="lumen-top">
        <div className="lumen-brand">
          <span className="lumen-brand-mark" aria-hidden />
          <span className="lumen-brand-name">{siteSettings.site_name || 'Placement'}</span>
          <span style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 0.35rem' }} />
          <div>
            <div className="lumen-stage-title">{meta.title}</div>
            <div className="lumen-stage-sub">{meta.sub}</div>
          </div>
        </div>

        <div className="lumen-top-actions">
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lumen-icon-btn"
              aria-label="Theme"
              onClick={() => setThemeOpen((v) => !v)}
            >
              {theme === 'light' ? <Sun size={17} /> : theme === 'dark' || theme === 'midnight' ? <Moon size={17} /> : <Palette size={17} />}
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
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs transition-colors ${
                        theme === opt.key ? 'text-[var(--copper)] bg-[var(--copper-soft)]' : 'text-[var(--bone-dim)] hover:bg-[var(--surface)]'
                      }`}
                    >
                      <Icon size={14} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <NotificationsBell
            onNavigate={(v) => onNavigate(v as ViewKey)}
            open={notifOpen}
            onOpenChange={setNotifOpen}
          />

          <button
            type="button"
            className="lumen-identity"
            onClick={() => onNavigate(role === 'company' ? 'company-profile' : 'profile')}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="lumen-avatar" />
            ) : (
              <span className="lumen-avatar">{initials}</span>
            )}
            <span className="lumen-identity-name">{profile?.full_name || 'You'}</span>
          </button>
        </div>
      </header>

      {/* Stage — main content */}
      <main className="lumen-stage">
        {children}
      </main>

      {/* Intent Spine — primary navigation */}
      <nav className="lumen-spine" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              className={`lumen-spine-item${active ? ' is-active' : ''}`}
              onClick={() => onNavigate(item.view)}
            >
              <Icon size={14} strokeWidth={active ? 2.25 : 1.75} />
              {item.label}
            </button>
          );
        })}

        {role !== 'company' && isViewEnabled('ai-assistant') && (
          <button
            type="button"
            className={`lumen-spine-item${currentView === 'ai-assistant' ? ' is-active' : ''}`}
            onClick={() => onNavigate('ai-assistant')}
          >
            <Sparkles size={14} />
            Guide
          </button>
        )}

        <div className="lumen-spine-tools">
          <button
            type="button"
            className={`lumen-spine-item${currentView === 'settings' ? ' is-active' : ''}`}
            onClick={() => onNavigate('settings')}
          >
            <Settings size={14} />
            Settings
          </button>
          <button type="button" className="lumen-spine-item" onClick={onSignOut}>
            <LogOut size={14} />
            Exit
          </button>
        </div>
      </nav>
    </div>
  );
}

export const AppShell = memo(AppShellInner);
