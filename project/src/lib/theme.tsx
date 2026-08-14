// ============================================================================
// src/lib/theme.tsx
//
// WHAT THIS FILE IS: it controls the site's color theme (dark / light /
// "aurora") and custom background wallpaper, and remembers the person's
// choice even after they close the browser and come back later — using
// the browser's built-in `localStorage`, which is just a small storage
// box that lives on the visitor's own computer, tied to this website.
//
// This uses a React pattern called "Context." Context is React's way of
// sharing one piece of information (here: "what theme is active right
// now") with any component in the app, no matter how deeply nested, WITHOUT
// having to manually pass it down as a prop through every single
// component in between. Think of it like a radio station: any component
// can "tune in" with `useTheme()` and get the current value, and if the
// value changes, every component tuned in re-renders automatically.
// ============================================================================

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// The only three themes this app supports. Writing it as a specific list
// of text options (rather than just "any string") means TypeScript will
// catch a typo like 'lite' instead of 'light' immediately.
export type Theme = 'dark' | 'light' | 'aurora';

// The shape of the information broadcast over our "radio station" — the
// current theme, plus a function any component can call to change it.
type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

// Create the actual Context "channel." It starts as `undefined` because,
// until a ThemeProvider (below) wraps the app, there's no real value yet.
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// The exact key names used to store these two settings in the browser's
// localStorage. Defined once here so we never risk typo-ing the key name
// differently in two different places.
const THEME_KEY = 'spc-theme';
const WALLPAPER_KEY = 'spc-wallpaper';

// Figures out what theme to start with when the page first loads: check
// if the browser remembers a previous choice, and use it if it's a valid
// theme name; otherwise default to 'dark'.
function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'aurora') return stored;
  return 'dark';
}

// `ThemeProvider` is a component that wraps around the ENTIRE app (see
// src/main.tsx) and makes the theme available to every component inside
// it. `{ children }` means "whatever components are placed inside
// <ThemeProvider>...</ThemeProvider> in the code" — this component's job
// is just to wrap them and supply the theme value.
export function ThemeProvider({ children }: { children: ReactNode }) {
  // React state for the current theme, starting from whatever
  // getInitialTheme() figured out. `theme` is the current value;
  // `setThemeState` is how we're allowed to change it (naming it
  // differently from the public `setTheme` below, since we want to run
  // extra logic — see below — whenever it actually changes).
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // `useEffect` here means "run this bit of code automatically, any time
  // `theme` changes" (that's what the `[theme]` at the end means — it's
  // the list of things this effect is watching).
  useEffect(() => {
    const root = document.documentElement; // the <html> tag itself
    // The site's CSS defines different colors for `.theme-light`,
    // `.theme-dark`, `.theme-aurora` classes on the <html> tag. We remove
    // whichever one was there before, and add the one matching the new
    // theme — this is literally what makes the whole page's colors change.
    root.classList.remove('theme-light', 'theme-dark', 'theme-aurora');
    root.classList.add(`theme-${theme}`);
    // Remember this choice for next time the person visits.
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // The function other components will call to actually change the theme.
  const setTheme = (t: Theme) => setThemeState(t);

  // Broadcast { theme, setTheme } to every component nested inside this
  // provider.
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

// The "tune in to the radio station" function any component calls to read
// the current theme (and get access to setTheme). Example usage in
// another file: `const { theme, setTheme } = useTheme();`
export function useTheme() {
  const ctx = useContext(ThemeContext);
  // If some component tries to use this OUTSIDE of a <ThemeProvider>
  // wrapper, `ctx` would be undefined — this throws a clear error
  // immediately instead of quietly breaking in a confusing way later.
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// ----------------------------------------------------------------------------
// Custom wallpaper (a separate, simpler setting — not part of the Context
// above, since not many components need to read it, so plain function
// calls are simpler than full Context machinery here).
// ----------------------------------------------------------------------------

// Reads the currently saved wallpaper image URL, or `null` if none is set.
export function getWallpaper(): string | null {
  return localStorage.getItem(WALLPAPER_KEY);
}

// Saves (or clears) the wallpaper choice.
export function setWallpaper(url: string | null) {
  if (url) localStorage.setItem(WALLPAPER_KEY, url);
  else localStorage.removeItem(WALLPAPER_KEY);
  // Announce "the wallpaper changed" to the whole page, so any component
  // showing the wallpaper (which isn't using React Context for this) can
  // notice and re-read it immediately, without needing a page refresh.
  window.dispatchEvent(new Event('wallpaper-change'));
}
