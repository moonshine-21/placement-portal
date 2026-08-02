import { useState } from 'react';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider, useToast } from '@/lib/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SessionGuard } from '@/lib/sessionGuard';
import { FeatureFlagsProvider, useFeatureFlags } from '@/lib/featureFlags';
import { ParticleBackground } from '@/components/ParticleBackground';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { AppShell, type ViewKey } from '@/components/AppShell';
import { DashboardView } from '@/views/DashboardView';
import { ProfileView } from '@/views/ProfileView';
import { UploadView } from '@/views/UploadView';
import { MatchesView } from '@/views/MatchesView';
import { ApplicationsView } from '@/views/ApplicationsView';
import { CompaniesBrowseView } from '@/views/CompaniesBrowseView';
import { MessagesView } from '@/views/MessagesView';
import { FriendsView } from '@/views/FriendsView';
import { AIAssistantView } from '@/views/AIAssistantView';
import { SettingsView } from '@/views/SettingsView';
import { CompanyOverviewView, CompanyProfileEditorView } from '@/views/CompanyViews';
import { JobsView } from '@/views/JobsView';
import { ApplicantsView } from '@/views/ApplicantsView';
import { CallManager } from '@/components/CallManager';
import { EventsView } from '@/views/EventsView';
import { AnnouncementsView } from '@/views/AnnouncementsView';
import { ProjectsView } from '@/views/ProjectsView';
import { BookmarksView } from '@/views/BookmarksView';
import { ForumView } from '@/views/ForumView';
import { LeaderboardView } from '@/views/LeaderboardView';
import { GraduationCap, Ban } from 'lucide-react';

const VIEW_FLAG_MAP: Partial<Record<ViewKey, string>> = {
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

function AppContent() {
  const { session, profile, loading, isPasswordRecovery, clearPasswordRecovery, signOut } = useAuth();
  const flags = useFeatureFlags();
  const [showLanding, setShowLanding] = useState(true);
  const [currentView, setCurrentView] = useState<ViewKey>('dashboard');
  const [callRequest, setCallRequest] = useState<{ calleeId: string; callType: 'friend' | 'interview' } | null>(null);
  const [pendingConvUser, setPendingConvUser] = useState<string | null>(null);

  // A password-recovery link logs the user into a real (but purpose-limited)
  // session so Supabase can verify the update. Intercept it here, before the
  // loading/session checks below, so it never falls through to the dashboard.
  if (isPasswordRecovery) {
    return <ResetPasswordPage onDone={clearPasswordRecovery} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
            <GraduationCap size={32} className="text-white" />
          </div>
          <div className="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    );
  }

  if (!session) {
    return showLanding ? (
      <LandingPage onOpenDashboard={() => setShowLanding(false)} />
    ) : (
      <LoginPage />
    );
  }

  if (profile?.is_banned) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
            <Ban size={28} className="text-rose-400" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">Account Suspended</h1>
          <p className="mb-1 text-sm text-[var(--text-secondary)]">
            Your account has been suspended by the placement cell administrators.
          </p>
          {profile.ban_reason && (
            <p className="mb-4 text-sm text-[var(--text-muted)]">Reason: {profile.ban_reason}</p>
          )}
          <button onClick={() => signOut()} className="btn-secondary mt-2 w-full">Sign Out</button>
        </div>
      </div>
    );
  }

  const role = profile?.role === 'company' ? 'company' : 'student';
  const studentOnlyViews: ViewKey[] = ['dashboard', 'profile', 'matches', 'upload', 'applications', 'companies', 'friends', 'ai-assistant', 'projects', 'bookmarks', 'leaderboard'];
  const companyOnlyViews: ViewKey[] = ['company-dashboard', 'company-profile', 'jobs', 'applicants', 'company-events', 'company-announcements'];
  const adminOnlyViews: ViewKey[] = ['admin-dashboard', 'admin-users', 'admin-content', 'admin-logs'];
  let effectiveView: ViewKey = currentView;
  // Company users: map student views to sensible company screens (profile → company-profile)
  if (role === 'company' && studentOnlyViews.includes(currentView)) {
    effectiveView = currentView === 'profile' ? 'company-profile' : 'company-dashboard';
  }
  if (role === 'student' && companyOnlyViews.includes(currentView)) effectiveView = 'dashboard';
  // The admin panel lives only in the separate standalone admin app now — this main site
  // never renders it, no matter what role the signed-in account has.
  if (adminOnlyViews.includes(currentView)) effectiveView = role === 'company' ? 'company-dashboard' : 'dashboard';
  const gatingFlag = VIEW_FLAG_MAP[effectiveView];
  if (gatingFlag && flags[gatingFlag] === false) {
    effectiveView = role === 'company' ? 'company-dashboard' : 'dashboard';
  }

  const { showToast } = useToast();

  const startCall = (calleeId: string, callType: 'friend' | 'interview') => {
    if (flags.calls === false) {
      showToast('Calling is currently disabled by an administrator.', 'error');
      return;
    }
    setCallRequest({ calleeId, callType });
  };

  const openConversation = (userId: string) => {
    setPendingConvUser(userId);
    setCurrentView('messages');
  };

  const handleSignOut = async () => {
    await signOut();
    setShowLanding(true);
  };

  const renderView = () => {
    switch (effectiveView) {
      case 'dashboard': return <DashboardView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
      case 'profile': return <ProfileView />;
      case 'upload': return <UploadView />;
      case 'matches': return <MatchesView />;
      case 'applications': return <ApplicationsView />;
      case 'companies': return <CompaniesBrowseView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
      case 'messages': return <MessagesView onStartCall={startCall} pendingOpenUserId={pendingConvUser} onOpened={() => setPendingConvUser(null)} />;
      case 'friends': return <FriendsView onNavigate={(v) => setCurrentView(v as ViewKey)} onOpenConversation={openConversation} onStartCall={startCall} />;
      case 'ai-assistant': return <AIAssistantView />;
      case 'settings': return <SettingsView onSignOut={handleSignOut} />;
      case 'company-dashboard': return <CompanyOverviewView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
      case 'company-profile': return <CompanyProfileEditorView />;
      case 'jobs': return <JobsView />;
      case 'applicants': return <ApplicantsView onNavigate={(v) => setCurrentView(v as ViewKey)} onOpenConversation={openConversation} onStartCall={startCall} />;
      case 'events': return <EventsView />;
      case 'announcements': return <AnnouncementsView />;
      case 'projects': return <ProjectsView />;
      case 'bookmarks': return <BookmarksView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
      case 'forum': return <ForumView />;
      case 'leaderboard': return <LeaderboardView />;
      case 'company-events': return <EventsView isCompany />;
      case 'company-announcements': return <AnnouncementsView isCompany />;
      default: return <DashboardView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
    }
  };

  return (
    <>
      <AppShell currentView={effectiveView} onNavigate={(v) => setCurrentView(v)} onSignOut={handleSignOut}>
        {renderView()}
      </AppShell>
      <CallManager startCallRequest={callRequest} onCallConsumed={() => setCallRequest(null)} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SessionGuard>
          <FeatureFlagsProvider>
            <AuthProvider>
              <ParticleBackground />
              <AppContent />
            </AuthProvider>
          </FeatureFlagsProvider>
        </SessionGuard>
      </ToastProvider>
    </ThemeProvider>
  );
}
