import { useState } from 'react';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/lib/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ParticleBackground } from '@/components/ParticleBackground';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
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
import { GraduationCap } from 'lucide-react';

function AppContent() {
  const { session, profile, loading, signOut } = useAuth();
  const [showLanding, setShowLanding] = useState(true);
  const [currentView, setCurrentView] = useState<ViewKey>('dashboard');
  const [callRequest, setCallRequest] = useState<{ calleeId: string; callType: 'friend' | 'interview' } | null>(null);
  const [pendingConvUser, setPendingConvUser] = useState<string | null>(null);

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

  const role = profile?.role === 'company' ? 'company' : profile?.role === 'admin' ? 'admin' : 'student';
  const studentOnlyViews: ViewKey[] = ['dashboard', 'profile', 'matches', 'upload', 'applications', 'companies', 'friends', 'ai-assistant', 'projects', 'bookmarks', 'leaderboard'];
  const companyOnlyViews: ViewKey[] = ['company-dashboard', 'company-profile', 'jobs', 'applicants', 'company-events', 'company-announcements'];
  let effectiveView: ViewKey = currentView;
  // Company users: map student views to sensible company screens (profile → company-profile)
  if (role === 'company' && studentOnlyViews.includes(currentView)) {
    effectiveView = currentView === 'profile' ? 'company-profile' : 'company-dashboard';
  }
  if (role === 'student' && companyOnlyViews.includes(currentView)) effectiveView = 'dashboard';

  const startCall = (calleeId: string, callType: 'friend' | 'interview') => {
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
        <AuthProvider>
          <ParticleBackground />
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
