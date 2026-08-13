// ============================================================================
// src/lib/siteSettings.tsx
//
// WHAT THIS FILE IS: makes the site's name and logo (set by an owner from
// the admin app's "Site Settings" page) actually show up on the live
// website, instead of the old hardcoded "SmartCell" text. Same pattern as
// featureFlags.tsx — load once from `site_settings`, then keep listening
// for live changes via Supabase realtime so an admin's edit shows up for
// everyone without needing a page refresh.
// ============================================================================

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

type SiteSettings = {
  site_name: string;
  logo_url: string | null;
};

const DEFAULTS: SiteSettings = { site_name: 'SmartCell', logo_url: null };

const SiteSettingsContext = createContext<{ settings: SiteSettings; loaded: boolean }>({
  settings: DEFAULTS,
  loaded: false,
});

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('site_name, logo_url')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) {
      // Table missing, row missing, or any other failure — fall back to
      // the defaults rather than leaving the site nameless/logo-less.
      setLoaded(true);
      return;
    }
    setSettings({ site_name: data.site_name || DEFAULTS.site_name, logo_url: data.logo_url || null });
    setLoaded(true);
  };

  useEffect(() => {
    load();
    document.title = settings.site_name; // keep the browser tab in sync too
    const channel = supabase
      .channel('site_settings_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the tab title in sync any time the loaded name changes (not just
  // on first load) — separate effect so it reacts to `settings` itself.
  useEffect(() => {
    if (loaded) document.title = settings.site_name;
  }, [settings.site_name, loaded]);

  return (
    <SiteSettingsContext.Provider value={{ settings, loaded }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

// The hook any component calls to read the current site name/logo, e.g.
// `const { site_name, logo_url } = useSiteSettings();`
export function useSiteSettings(): SiteSettings {
  const { settings } = useContext(SiteSettingsContext);
  return settings;
}
