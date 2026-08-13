// ============================================================================
// src/lib/auth.tsx
//
// WHAT THIS FILE IS: this is the file that answers "who is currently
// logged in?" for the entire app. It wraps the whole site (see
// src/main.tsx) in an AuthProvider, which:
//   1. Checks, the moment the page loads, whether the visitor already has
//      a valid login session (so they don't have to log in again every
//      time they open the site).
//   2. Keeps listening for login/logout events for as long as the page is
//      open (so if someone logs out in one browser tab, this could react
//      to it too).
//   3. Loads that person's full Profile row from the database (their
//      name, role, skills, etc — see the Profile type in supabase.ts), not
//      just their bare login info.
//   4. Shares all of this — session, user, profile, loading state — with
//      every component in the app via `useAuth()`, using the same React
//      Context pattern as theme.tsx and toast.tsx.
//
// Two DIFFERENT concepts worth telling apart here:
//   `user`    — Supabase's own built-in login record (just an ID + email,
//               nothing about the site itself)
//   `profile` — OUR app's own row of information ABOUT that user (their
//               name, role, skills, resume, etc) — this only exists
//               because our own code created it (see loadProfile below)
// ============================================================================

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js'; // Supabase's own built-in types for "a login session" and "a logged-in user"
import { supabase, authEvents, isPasswordRecoveryPending, clearPasswordRecoveryPending } from './supabase';
import type { Profile } from './supabase';

// Everything this file shares with the rest of the app via Context.
type AuthContextValue = {
  session: Session | null;                    // the raw Supabase login session (null if logged out)
  user: User | null;                           // the raw Supabase user record (null if logged out)
  profile: Profile | null;                     // our app's own data about this user (null if logged out, or still loading)
  loading: boolean;                            // true until we've finished the very first login check
  isPasswordRecovery: boolean;                 // true if the visitor arrived via a "reset your password" email link
  clearPasswordRecovery: () => void;           // called once the reset-password screen has been shown/handled
  refreshProfile: () => Promise<void>;         // re-fetch the profile from the database (e.g. after editing it)
  signOut: () => Promise<void>;                // log the current user out
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true); // starts true — we don't know yet if anyone's logged in
  // `useState(() => isPasswordRecoveryPending())` — using a function here
  // (instead of just `useState(isPasswordRecoveryPending())`) means "only
  // run this check ONCE, the very first time this component is created,"
  // rather than re-running it on every re-render.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => isPasswordRecoveryPending());

  // Fetches (or creates, if missing) this user's Profile row from the
  // database. Takes the raw pieces we already know from the login system
  // (their ID, email, and any "metadata" collected at signup, like the
  // name they typed into the signup form).
  const loadProfile = async (uid: string, email: string, metadata?: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')          // get every column
      .eq('id', uid)         // WHERE id = this user's ID
      .maybeSingle();        // expect at most one matching row (not a list)

    if (error) {
      console.error('loadProfile fetch failed:', error);
      return;
    }

    if (!data) {
      // No profile row exists yet for this user — this happens the very
      // first time someone logs in after signing up, since account
      // creation (in Supabase's login system) and profile creation (in
      // our own `profiles` table) are two separate steps. So: create one
      // now, using whatever name they typed at signup (if any).
      const { data: created, error: insErr } = await supabase
        .from('profiles')
        .insert({
          id: uid,
          email,
          full_name: (metadata?.full_name as string) || '',
        })
        .select()        // ask Supabase to hand back the row we just created
        .maybeSingle();
      if (insErr) {
        console.error('loadProfile insert failed:', insErr);
        return;
      }
      setProfile(created as Profile);
    } else {
      // A profile already existed — just use it. Using the FUNCTIONAL form
      // of setProfile here, and bailing out with the exact same `prev`
      // reference when nothing actually changed, matters a lot: Supabase
      // silently re-validates/refreshes the session in the background
      // (e.g. whenever the browser tab regains focus, or on its periodic
      // token refresh), which re-runs this function with IDENTICAL data
      // but a brand new object from the query. Every view with
      // `useEffect(..., [profile])` (QuizzesView, DashboardView,
      // CompanyOverviewView, etc) treats a new object reference as "the
      // profile changed" and re-fetches, which is what was causing the
      // whole page to flash back to a loading/skeleton state every time
      // you switched tabs and back. Returning the SAME reference when the
      // data is unchanged tells React (and everything reading this
      // context) that nothing actually happened, so nothing re-runs.
      setProfile((prev) => {
        const next = data as Profile;
        if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    }
  };

  // A function other parts of the app can call (via useAuth()) to re-fetch
  // the current profile — e.g. right after the user edits their profile,
  // so the rest of the app immediately reflects the change.
  const refreshProfile = async () => {
    if (user) await loadProfile(user.id, user.email || '', user.user_metadata);
  };

  // Same "don't hand out a new object reference unless something that
  // actually matters changed" fix as loadProfile above, applied to `user`.
  // Supabase rebuilds `session.user` from scratch on every background
  // token refresh / tab-focus revalidation, even though it's still the
  // exact same account — several views key their data-loading effects off
  // `user` (e.g. `useEffect(load, [user])` in NotificationsBell,
  // MessagesView, FriendsView, ProjectsView, LeaderboardView,
  // BookmarksView, CallManager), so a fresh object every few minutes was
  // making all of those flash back to a loading state too. Only the
  // account's identity (its id) actually matters for any of them, so
  // that's all we compare.
  const syncUser = (newUser: User | null) => {
    setUser((prev) => (prev && newUser && prev.id === newUser.id ? prev : newUser));
  };

  // This effect runs ONCE, when the app first starts, and sets up
  // everything needed to track login state for as long as the page stays open.
  useEffect(() => {
    // Same "avoid updating state after this component is gone" pattern
    // used in sessionGuard.tsx.
    let mounted = true;

    // If supabase.ts detects a password-recovery link in the URL (see the
    // detailed explanation in supabase.ts), it announces this via
    // `authEvents`. We listen for that announcement here and update our
    // state to match, so the app can show the "choose a new password"
    // screen (see src/pages/ResetPasswordPage.tsx).
    const onRecoveryEvent = () => {
      if (mounted) setIsPasswordRecovery(true);
    };
    authEvents.addEventListener('password-recovery', onRecoveryEvent);

    // Step 1: check, right now, whether this browser already has a saved
    // login session (from a previous visit).
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      syncUser(data.session?.user ?? null);
      if (data.session?.user) {
        // Logged in — also fetch their Profile data, and only mark
        // loading as finished once THAT'S done too (not just the login
        // check), so the rest of the app never sees "logged in, but no
        // profile yet" for even a moment.
        loadProfile(data.session.user.id, data.session.user.email || '', data.session.user.user_metadata).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        // Not logged in — nothing more to load.
        setLoading(false);
      }
    });

    // Step 2: keep listening for FUTURE login state changes — someone
    // logging in, logging out, or their session refreshing — for as long
    // as the app stays open. This is what makes the UI update immediately
    // after someone logs in, without needing to reload the page.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (_event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      setSession(newSession);
      syncUser(newSession?.user ?? null);
      if (newSession?.user) {
        loadProfile(newSession.user.id, newSession.user.email || '', newSession.user.user_metadata).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        // They logged out (or their session became invalid) — clear the
        // profile too, so no stale data lingers on screen.
        setProfile(null);
        setLoading(false);
      }
    });

    // Cleanup, run automatically if this component is ever removed:
    // stop listening for both kinds of events, so we don't leak memory or
    // accidentally react to events after the app is gone.
    return () => {
      mounted = false;
      authEvents.removeEventListener('password-recovery', onRecoveryEvent);
      listener.subscription.unsubscribe();
    };
  }, []); // run this setup exactly once

  // Logs the current user out, and clears our locally-cached profile too.
  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  // Called once the password-recovery screen has been shown/handled, so
  // we don't keep re-showing it.
  const clearPasswordRecovery = () => {
    clearPasswordRecoveryPending();
    setIsPasswordRecovery(false);
  };

  // Share everything with the rest of the app.
  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, isPasswordRecovery, clearPasswordRecovery, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// The function any component calls to read the current login state, e.g.
// `const { profile, signOut } = useAuth();`
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
