// ============================================================================
// src/lib/featureFlags.tsx
//
// WHAT THIS FILE IS: "feature flags" are on/off switches for parts of the
// site, controllable by an admin from the Admin panel WITHOUT needing to
// change any code or redeploy the website. For example, "maintenance_mode"
// is a feature flag — flipping it on shows everyone a "down for
// maintenance" page instead of the normal site.
//
// This file loads the current on/off state of every flag from the
// database when the app starts, shares that list with the whole app via
// React Context (same pattern as theme.tsx and toast.tsx), and keeps it
// updated LIVE if an admin changes a flag while people are using the site
// — using Supabase's "realtime" feature, which is like a live phone line
// to the database that rings whenever a row changes.
// ============================================================================

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

// A simple lookup table: flag name (text) → is it on? (true/false).
// e.g. { maintenance_mode: false, some_other_flag: true }
type FlagsMap = Record<string, boolean>;

// The Context "channel." `loaded` tracks whether we've successfully
// fetched the flags at least once yet, so components can tell the
// difference between "still loading" and "loaded, and this flag doesn't
// exist / is off."
const FeatureFlagsContext = createContext<{ flags: FlagsMap; loaded: boolean }>({ flags: {}, loaded: false });

// Wraps the whole app (see src/main.tsx) so any component can check
// "is this feature currently turned on?"
export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FlagsMap>({});
  const [loaded, setLoaded] = useState(false);

  // Fetches the current state of every flag from the database and stores
  // it in our `flags` lookup table. This is written as its own named
  // function (rather than inline) because we need to call it TWICE below
  // — once immediately on page load, and again every time a flag changes.
  const load = async () => {
    console.log('[flicker-debug] featureFlags load() called at', performance.now().toFixed(0) + 'ms');
    const { data, error } = await supabase.from('feature_flags').select('key, enabled');
    if (error) {
      console.error('Failed to load feature flags:', error);
      setLoaded(true); // still mark as "loaded" even on failure, so the app doesn't get stuck waiting forever
      return;
    }
    // Turn the list of { key, enabled } rows the database gave us into
    // our simpler { key: enabled } lookup table.
    const map: FlagsMap = {};
    for (const row of data || []) map[row.key] = row.enabled;
    setFlags(map);
    setLoaded(true);
  };

  useEffect(() => {
    // Load the flags once, right when the app starts.
    load();

    // Live updates: if an admin flips a switch while someone is on the
    // site, it takes effect without needing a page refresh.
    //
    // `.channel(...)` opens a live connection to Supabase's realtime
    // system. `.on('postgres_changes', ...)` tells it "let me know about
    // ANY change (`event: '*'` means insert/update/delete, all of them)
    // to the `feature_flags` table" — and whenever that happens, just
    // re-run `load()` to refetch the full up-to-date list.
    const channel = supabase
      .channel('feature_flags_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, load)
      .subscribe();

    // This function runs automatically when the component using this
    // effect is removed from the page (e.g. the whole app unmounting) —
    // it's important to close the live connection here, or it would keep
    // running forever in the background, wasting resources.
    return () => { supabase.removeChannel(channel); };
  }, []); // empty list `[]` means "only run this setup once, when the app first starts" — not on every re-render

  return (
    <FeatureFlagsContext.Provider value={{ flags, loaded }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

// The function a component calls to check ONE specific flag, e.g.
// `const showMaintenancePage = useFeatureFlag('maintenance_mode');`
//
// Defaults to enabled (true) for any key not yet loaded or not present in
// the table, so a feature never disappears just because the flags query is
// still in flight or an admin hasn't created a row for a newer feature yet.
// In other words: flags are "opt-out," not "opt-in" — the safe default is
// always "on," and an admin has to deliberately turn something off.
export function useFeatureFlag(key: string): boolean {
  const { flags, loaded } = useContext(FeatureFlagsContext);
  if (!loaded) return true;
  return flags[key] !== false;
}

// The function a component calls when it needs the WHOLE list of flags at
// once (e.g. the admin panel's "manage feature flags" screen), rather than
// checking just one.
export function useFeatureFlags(): FlagsMap {
  const { flags } = useContext(FeatureFlagsContext);
  return flags;
}

// Whether the initial flags fetch has completed yet. Most consumers don't
// need this (they're fine with the "opt-out" default-true behavior above),
// but anything that would otherwise show something, then immediately hide
// it again the instant real data arrives (a visible flicker) should wait
// for `loaded` before deciding what to render at all — see AppShell.tsx's
// nav list for the concrete case this was added for.
export function useFeatureFlagsLoaded(): boolean {
  const { loaded } = useContext(FeatureFlagsContext);
  return loaded;
}
