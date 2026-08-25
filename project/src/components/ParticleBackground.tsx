import { useEffect, useState } from 'react';
import { useTheme, getWallpaper } from '@/lib/theme';

function applyWallpaperCss(url: string | null) {
  const root = document.documentElement;
  if (url) {
    root.style.setProperty('--wallpaper-url', `url("${url}")`);
    root.classList.add('has-wallpaper');
  } else {
    root.style.removeProperty('--wallpaper-url');
    root.classList.remove('has-wallpaper');
  }
}

/**
 * Paint-stable application background.
 *
 * The old implementation continuously animated a full-window canvas while
 * the shell also used translucent/composited surfaces. Even after removing
 * the active nav pill, that left Chrome with a large changing layer behind
 * the application and made navigation/visibility changes look like flashes.
 * The background is intentionally static now. The UI still has its ambient
 * gradients and optional wallpaper, but there is no requestAnimationFrame
 * loop and no canvas compositing work.
 */
export function ParticleBackground() {
  const { theme } = useTheme();
  const [wallpaper, setWallpaperState] = useState<string | null>(() => getWallpaper());

  useEffect(() => {
    applyWallpaperCss(wallpaper);
  }, [wallpaper]);

  useEffect(() => {
    const onChange = () => setWallpaperState(getWallpaper());
    window.addEventListener('wallpaper-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('wallpaper-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  // Keep theme subscribed so changing theme updates the CSS variables used by
  // the static background without restarting an animation loop.
  void theme;

  return <div className="app-bg" aria-hidden="true" />;
}
