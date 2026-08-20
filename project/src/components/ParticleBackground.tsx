// ============================================================================
// src/components/ParticleBackground.tsx
//
// WHAT THIS FILE IS: the animated background behind the whole app — small
// glowing dots that drift around and draw faint connecting lines when
// they're near each other (a common "constellation" style effect). It
// also applies a custom user-uploaded wallpaper image, if one is set (see
// src/lib/theme.tsx's getWallpaper/setWallpaper).
//
// This is drawn using the HTML5 <canvas> element, a low-level "drawing
// surface" the browser provides — unlike normal HTML elements (which the
// browser manages for you), a canvas is a blank rectangle you personally
// draw pixels/shapes onto, frame by frame, using JavaScript. This is the
// right tool here because we're animating dozens of independently-moving
// dots continuously — doing that with regular HTML elements would be far
// slower.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useTheme, getWallpaper } from '@/lib/theme';

// One single moving dot: its position (x, y), its velocity/speed in each
// direction (vx, vy — how much it moves per animation frame), and its
// visual size/opacity.
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
};

// Applies (or removes) the custom wallpaper by setting a CSS variable on
// the <html> tag — the actual visual wallpaper styling lives in the CSS
// file, this function just tells it which image URL to use (or "none," by
// removing the class entirely, if there's no custom wallpaper set).
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

export function ParticleBackground() {
  // A ref pointing at the actual <canvas> HTML element once it's on the
  // page, so we can get its drawing context and start drawing on it.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  // Why store the theme in a ref (`themeRef`) IN ADDITION to reading it
  // normally above? Because the animation loop below (`draw`) is set up
  // ONCE, inside a `useEffect` that only runs once (see the empty `[]` at
  // the bottom) — if it directly used the `theme` variable from render, it
  // would keep using whatever theme was active the very first time the
  // loop started, forever, even after the person switches themes. A ref's
  // `.current` value can be read fresh on every animation frame without
  // needing to restart the whole animation loop from scratch.
  const themeRef = useRef(theme);
  themeRef.current = theme; // keep the ref updated on every render

  // The current custom wallpaper URL, if any — `useState(() => getWallpaper())`
  // reads it once immediately, so there's no flash of "no wallpaper"
  // before the real one loads in.
  const [wallpaper, setWallpaperState] = useState<string | null>(() => getWallpaper());

  // Whenever the wallpaper state changes, re-apply it to the page's CSS.
  useEffect(() => {
    applyWallpaperCss(wallpaper);
  }, [wallpaper]);

  // Listens for wallpaper changes triggered from ELSEWHERE — either this
  // same browser tab (via the custom 'wallpaper-change' event fired in
  // theme.tsx's setWallpaper) or a DIFFERENT tab of the same site (the
  // browser's built-in 'storage' event fires automatically whenever
  // localStorage changes in another tab).
  useEffect(() => {
    const onChange = () => {
      const url = getWallpaper();
      setWallpaperState(url);
      applyWallpaperCss(url);
    };
    // apply once on mount
    onChange();
    window.addEventListener('wallpaper-change', onChange);
    // storage event for other tabs
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('wallpaper-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  // THE ANIMATION ITSELF — sets up the particles and starts an endless
  // drawing loop, once, when this component first appears.
  useEffect(() => {
    return; // particles disabled — see return below
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d'); // the actual drawing tool for a 2D canvas
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationId = 0; // used later to cancel the animation loop on cleanup
    let width = 0;
    let height = 0;

    // (Re)creates the particle list, sized to fill the current window.
    // Called once at the start, and again any time the window resizes.
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      // Scale the NUMBER of particles with screen area, so a huge monitor
      // doesn't get a sparse-looking background and a small phone screen
      // doesn't get an overcrowded one — capped at 90 so it never gets
      // excessive (and slow) on very large screens.
      const count = Math.min(Math.floor((width * height) / 18000), 90);
      // Build the initial list of particles, each starting at a random
      // position with a small random drift speed/direction.
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3, // random value between -0.15 and +0.15
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.8,
        opacity: Math.random() * 0.4 + 0.15,
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    // One single "frame" of the animation: move every particle a tiny
    // bit, draw them, draw connecting lines between nearby ones, then
    // schedule the NEXT frame — this function calls itself forever
    // (via requestAnimationFrame), which is what creates continuous motion.
    const draw = () => {
      ctx.clearRect(0, 0, width, height); // wipe the previous frame before drawing the new one
      const t = themeRef.current;
      // Pick the particle color based on the current theme, so the
      // background always looks intentional rather than clashing with
      // whichever color scheme is active.
      const colorMap: Record<string, string> = {
        light: '2, 132, 199',
        aurora: '129, 140, 248',
        midnight: '96, 165, 250',
        sunset: '251, 146, 60',
        ocean: '45, 212, 191',
        dark: '56, 189, 248',
      };
      const color = colorMap[t] || '56, 189, 248';

      particles.forEach((p, i) => {
        // Move this particle by its velocity.
        p.x += p.vx;
        p.y += p.vy;
        // If it's drifted past an edge of the screen, reverse its
        // direction on that axis — this is what makes particles "bounce"
        // gently off the edges instead of disappearing.
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Draw the particle itself as a small filled circle.
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); // a full circle, from angle 0 to 2π radians
        ctx.fillStyle = `rgba(${color}, ${p.opacity})`;
        ctx.fill();

        // Compare this particle against every OTHER particle that comes
        // AFTER it in the list (`j = i + 1`) — this avoids checking every
        // pair twice (once as A-vs-B, again later as B-vs-A), which would
        // be wasted work.
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          // Basic distance formula (Pythagorean theorem) between the two points.
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Only draw a connecting line if they're close enough — and
          // make the line fainter the further apart they are (up to the
          // 130-pixel cutoff), which is what creates the fading
          // "constellation" look rather than harsh on/off lines.
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${color}, ${(1 - dist / 130) * 0.08})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      });

      // Ask the browser to call `draw` again right before the next
      // screen refresh — this is the standard, efficient way to run a
      // smooth animation loop in a browser (much better than a fixed
      // `setInterval`, since it automatically syncs with the display's
      // actual refresh rate and pauses when the tab isn't visible).
      animationId = requestAnimationFrame(draw);
    };

    draw(); // kick off the very first frame

    // Cleanup when this component is removed from the page: stop the
    // animation loop and the resize listener, so they don't keep running
    // forever in the background.
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []); // run this setup exactly once

  // Particles DISABLED — continuous canvas rAF + backdrop-filter glass on the
  // sidebar caused visible shimmer/flicker even when React was stable.
  // Wallpaper + static gradient background remain.
  return <div className="app-bg" />;
}
