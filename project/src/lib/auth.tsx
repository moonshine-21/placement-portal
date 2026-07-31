import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // The reset-password email links back to this same site with #type=recovery
  // in the URL. Supabase auto-signs the visitor in when that hash is present,
  // so without this flag they'd land straight in the normal dashboard with no
  // way to actually set a new password.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  );

  const loadProfile = async (uid: string, email: string, metadata?: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('loadProfile fetch failed:', error);
      return;
    }

    if (!data) {
      const { data: created, error: insErr } = await supabase
        .from('profiles')
        .insert({
          id: uid,
          email,
          full_name: (metadata?.full_name as string) || '',
        })
        .select()
        .maybeSingle();
      if (insErr) {
        console.error('loadProfile insert failed:', insErr);
        return;
      }
      setProfile(created as Profile);
    } else {
      setProfile(data as Profile);
    }
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id, user.email || '', user.user_metadata);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id, data.session.user.email || '', data.session.user.user_metadata).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        loadProfile(newSession.user.id, newSession.user.email || '', newSession.user.user_metadata).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
    // Strip the #access_token=...&type=recovery hash so a refresh doesn't
    // re-trigger the reset screen.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, isPasswordRecovery, clearPasswordRecovery, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
