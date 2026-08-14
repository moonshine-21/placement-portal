import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

type FlagsMap = Record<string, boolean>;

const FeatureFlagsContext = createContext<{ flags: FlagsMap; loaded: boolean }>({ flags: {}, loaded: false });

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FlagsMap>({});
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('feature_flags').select('key, enabled');
    if (error) {
      console.error('Failed to load feature flags:', error);
      setLoaded(true);
      return;
    }
    const map: FlagsMap = {};
    for (const row of data || []) map[row.key] = row.enabled;
    setFlags(map);
    setLoaded(true);
  };

  useEffect(() => {
    load();

    // Live updates: if an admin flips a switch while someone is on the
    // site, it takes effect without needing a page refresh.
    const channel = supabase
      .channel('feature_flags_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, load)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <FeatureFlagsContext.Provider value={{ flags, loaded }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

// Defaults to enabled (true) for any key not yet loaded or not present in
// the table, so a feature never disappears just because the flags query is
// still in flight or an admin hasn't created a row for a newer feature yet.
export function useFeatureFlag(key: string): boolean {
  const { flags, loaded } = useContext(FeatureFlagsContext);
  if (!loaded) return true;
  return flags[key] !== false;
}

export function useFeatureFlags(): FlagsMap {
  const { flags } = useContext(FeatureFlagsContext);
  return flags;
}
