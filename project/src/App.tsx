// ============================================================================
// src/App.tsx
//
// WHAT THIS FILE IS: the "traffic control center" of the entire website.
// It doesn't draw much itself — instead, it:
//   1. Sets up every shared Context provider (theme, toasts, auth, feature
//      flags, session-ban checking) that the rest of the app relies on,
//      wrapped around each other in a specific, meaningful order (see the
//      bottom of this file).
//   2. Decides WHICH page/screen to show at any given moment — landing
//      page, login, maintenance, banned, or the real app — based on
//      login state and admin settings.
//   3. Once someone's properly logged in, decides which of the ~20
//      "views" (see src/views/) to display, based on which one is
//      currently selected AND the person's role (student vs company) —
//      this is effectively a hand-rolled router, without needing a
//      separate routing library.
//
// This file has NO routing library (like React Router) — instead, it just
// keeps track of "which view is currently selected" as a single piece of
// state (`currentView`), and swaps out which component gets rendered
// based on that. This is a common, simpler alternative to a full router
// for apps that don't need real browser URLs to change per page.
// ============================================================================

import { useState } from 'react';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider, useToast } from '@/lib/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SessionGuard } from '@/lib/sessionGuard';
import { FeatureFlagsProvider, useFeatureFlags, useFeatureFlagsLoaded } from '@/lib/featureFlags';
import { SiteSettingsProvider } from '@/lib/siteSettings';
import { ParticleBackground } from '@/components/ParticleBackground';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { AppShell, type ViewKey } from '@/components/AppShell';
// Every single "page" of the actual app, once logged in — one import per view.
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
import { QuizzesView } from '@/views/QuizzesView';
import { CallManager } from '@/components/CallManager';
import { EventsView } from '@/views/EventsView';
import { AnnouncementsView } from '@/views/AnnouncementsView';
import { ProjectsView } from '@/views/ProjectsView';
import { BookmarksView } from '@/views/BookmarksView';
import { ForumView } from '@/views/ForumView';
import { LeaderboardView } from '@/views/LeaderboardView';
import { GraduationCap, Ban } from 'lucide-react';

// Maps certain views to the feature-flag key that can turn them off. If an
// admin disables, say, the 'forum' flag, then anyone trying to view
// 'forum' gets silently redirected back to their dashboard instead (see
// the `gatingFlag` check further down). Views NOT listed here (like
// 'dashboard' or 'profile') have no flag and can never be disabled this way.
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

// The actual logic lives in `AppContent`, kept SEPARATE from the outer
// `App` component below — this matters because `AppContent` needs to call
// `useAuth()`, `useFeatureFlags()`, etc, which only work INSIDE their
// matching Provider. If this logic were in `App` itself, those Providers
// wouldn't exist yet at the moment `App` runs, and the hooks would crash.
function AppContent() {
  const { session, profile, loading, isPasswordRecovery, clearPasswordRecovery, signOut } = useAuth();
  const flags = useFeatureFlags();
  const flagsLoaded = useFeatureFlagsLoaded();
  const [showLanding, setShowLanding] = useState(true);       // logged-out visitors see the marketing LandingPage first, until they click through to login
  const [currentView, setCurrentView] = useState<ViewKey>('dashboard'); // which app "page" is selected, once logged in
  // Holds details about an in-progress request to start a video call —
  // set by whichever view initiates one, read by <CallManager>.
  const [callRequest, setCallRequest] = useState<{ calleeId: string; callType: 'friend' | 'interview' } | null>(null);
  // Lets one view (e.g. "message this person" button on a profile) tell
  // MessagesView "please open a conversation with this specific person"
  // the moment we switch to the Messages tab.
  const [pendingConvUser, setPendingConvUser] = useState<string | null>(null);

  // A password-recovery link logs the user into a real (but purpose-limited)
  // session so Supabase can verify the update. Intercept it here, before the
  // loading/session checks below, so it never falls through to the dashboard.
  if (isPasswordRecovery) {
    return <ResetPasswordPage onDone={clearPasswordRecovery} />;
  }

  // Site-wide kill switch, toggled from the admin app's Feature Flags
  // screen. Deliberately checked before the loading/session/landing logic
  // below so it blocks everyone — logged out, mid-login, student, or
  // company — the moment it's flipped on. The separate admin app is a
  // different application entirely and is never gated by this.
  if (flags.maintenance_mode === true) {
    return <MaintenancePage />;
  }

  // Still waiting to hear back from Supabase about whether anyone's
  // logged in — show a simple loading screen rather than flashing the
  // wrong page for a split second.
  //
  // We ALSO wait for `flagsLoaded` here, but only when there's an active
  // session (a logged-out visitor's landing/login page doesn't have a
  // sidebar and doesn't care about flags, so there's no reason to delay
  // it). AppShell's nav list hides flag-gated items until `flagsLoaded`
  // is true (see AppShell.tsx), but that guard alone isn't enough — if
  // `loading` here finishes before the separate feature-flags fetch
  // does, AppShell mounts immediately with the reduced nav list, and
  // then a moment later `flagsLoaded` flips true and the flag-gated
  // items (Messages, Forum, Events, etc) pop into the sidebar — that
  // pop-in IS the "sidebar blinking" after refresh. Waiting for both
  // fetches here means AppShell only ever mounts once, already in its
  // final state, so there's nothing left to pop in.
  if (loading || (session && !flagsLoaded)) {
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

  // Not logged in at all — show either the marketing landing page or the
  // login form, depending on where they are in that flow.
  if (!session) {
    return showLanding ? (
      <LandingPage onOpenDashboard={() => setShowLanding(false)} />
    ) : (
      <LoginPage />
    );
  }

  // Logged in, but this account has been banned by an admin — show the
  // suspension screen instead of any part of the real app, no matter what
  // view they try to select.
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

  // ---------- Everything below here: a real, active, non-banned user ----------

  const role = profile?.role === 'company' ? 'company' : 'student';

  // These three lists exist purely to figure out "is the CURRENTLY
  // SELECTED view even valid for this person's role?" — e.g. a student
  // shouldn't be able to land on the company's "Applicants" screen.
  const studentOnlyViews: ViewKey[] = ['dashboard', 'profile', 'matches', 'upload', 'applications', 'companies', 'friends', 'ai-assistant', 'projects', 'bookmarks', 'leaderboard'];
  const companyOnlyViews: ViewKey[] = ['company-dashboard', 'company-profile', 'jobs', 'applicants', 'quizzes', 'company-events', 'company-announcements'];
  const adminOnlyViews: ViewKey[] = ['admin-dashboard', 'admin-users', 'admin-content', 'admin-logs'];

  // Start out assuming the current selection is fine, then correct it if
  // it's not appropriate for this specific person's role.
  let effectiveView: ViewKey = currentView;
  // Company users: map student views to sensible company screens (profile → company-profile)
  if (role === 'company' && studentOnlyViews.includes(currentView)) {
    effectiveView = currentView === 'profile' ? 'company-profile' : 'company-dashboard';
  }
  if (role === 'student' && companyOnlyViews.includes(currentView)) effectiveView = 'dashboard';
  // The admin panel lives only in the separate standalone admin app now — this main site
  // never renders it, no matter what role the signed-in account has.
  if (adminOnlyViews.includes(currentView)) effectiveView = role === 'company' ? 'company-dashboard' : 'dashboard';

  // Also redirect away from any view an admin has disabled via a feature
  // flag (see VIEW_FLAG_MAP above).
  const gatingFlag = VIEW_FLAG_MAP[effectiveView];
  if (gatingFlag && flags[gatingFlag] === false) {
    effectiveView = role === 'company' ? 'company-dashboard' : 'dashboard';
  }

  const { showToast } = useToast();

  // Called by various views (e.g. a "call this person" button) to kick
  // off a video call — respects the admin's "calls" feature flag first.
  const startCall = (calleeId: string, callType: 'friend' | 'interview') => {
    if (flags.calls === false) {
      showToast('Calling is currently disabled by an administrator.', 'error');
      return;
    }
    setCallRequest({ calleeId, callType });
  };

  // Called by various views (e.g. a "message this person" button) to jump
  // straight to a specific conversation in the Messages tab.
  const openConversation = (userId: string) => {
    setPendingConvUser(userId);
    setCurrentView('messages');
  };

  // Signs the person out AND resets back to the landing page (rather than
  // dropping a signed-out visitor straight onto the login form).
  const handleSignOut = async () => {
    await signOut();
    setShowLanding(true);
  };

  // THE ACTUAL "ROUTER": given the current `effectiveView`, decide which
  // view component to render. A plain JavaScript `switch` statement is
  // doing the job a routing library would normally do in a larger app.
  const renderView = () => {
    switch (effectiveView) {
      case 'dashboard': return <DashboardView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
      case 'profile': return <ProfileView />;
      case 'upload': return <UploadView />;
      case 'matches': return <MatchesView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
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
      case 'quizzes': return <QuizzesView />;
      case 'events': return <EventsView />;
      case 'announcements': return <AnnouncementsView />;
      case 'projects': return <ProjectsView />;
      case 'bookmarks': return <BookmarksView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
      case 'forum': return <ForumView />;
      case 'leaderboard': return <LeaderboardView />;
      // 'company-events'/'company-announcements' reuse the SAME
      // EventsView/AnnouncementsView components used by students, just
      // with `isCompany` set to true — that prop switches on the
      // "create new" controls that only a company account should see.
      case 'company-events': return <EventsView isCompany />;
      case 'company-announcements': return <AnnouncementsView isCompany />;
      default: return <DashboardView onNavigate={(v) => setCurrentView(v as ViewKey)} />;
    }
  };

  return (
    <>
      {/* AppShell is the surrounding "frame" — sidebar/top bar navigation
          — with `renderView()`'s result placed inside it as the main
          content area. See src/components/AppShell.tsx.

          Deliberately NO fade/transition here — renders instantly, the
          moment loading finishes, with zero animation. */}
      <AppShell currentView={effectiveView} onNavigate={(v) => setCurrentView(v)} onSignOut={handleSignOut}>
        {renderView()}
      </AppShell>
      {/* CallManager sits OUTSIDE AppShell (as a sibling, not a child) so
          an incoming/active call overlay can show up regardless of which
          view is currently on screen. */}
      <CallManager startCallRequest={callRequest} onCallConsumed={() => setCallRequest(null)} />
    </>
  );
}

// THE ACTUAL EXPORTED COMPONENT — this is what src/main.tsx renders.
// Its only job is stacking every Context Provider around AppContent, in
// this specific nested order (outermost first):
//
//   ThemeProvider        — needs to be outermost so even error/loading
//                           screens get correct theme colors
//   ToastProvider        — toasts can be triggered from anywhere, including inside SessionGuard
//   SessionGuard         — checks for a device/IP ban BEFORE showing
//                           anything else (including the login form) —
//                           this is why it wraps everything below it
//   FeatureFlagsProvider — needs to load before AppContent, since
//                           AppContent immediately checks flags.maintenance_mode
//   AuthProvider         — provides login state to AppContent
//   ParticleBackground   — the animated background, rendered as a sibling
//                           of AppContent so it sits behind everything
//   AppContent           — the actual page logic described above
export default function App() {
  return (
    <SiteSettingsProvider>
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
    </SiteSettingsProvider>
  );
}
