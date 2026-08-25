import { useEffect, useRef, useState } from 'react';
import { useTheme, getWallpaper } from '@/lib/theme';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  phase: number;
};

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
 * Theme-aware ambient background.
 * Wallpaper mode: particles dim way down so the image stays sharp.
 * Only individual glass panels (cards/header/sidebar) frost the BG — never the whole page.
 */
export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [wallpaper, setWallpaperState] = useState<string | null>(() => getWallpaper());
  const wallpaperRef = useRef(wallpaper);
  wallpaperRef.current = wallpaper;

  useEffect(() => {
    applyWallpaperCss(wallpaper);
  }, [wallpaper]);

  useEffect(() => {
    const onChange = () => setWallpaperState(getWallpaper());
    window.addEventListener('storage', onChange);
    window.addEventListener('wallpaper-change', onChange as EventListener);
    window.addEventListener('spc-wallpaper-change', onChange as EventListener);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('wallpaper-change', onChange as EventListener);
      window.removeEventListener('spc-wallpaper-change', onChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let raf = 0;
    let lastFrame = 0;
    let running = true;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const themeColors: Record<string, string> = {
      light: '2,132,199',
      aurora: '167,139,250',
      midnight: '96,165,250',
      sunset: '251,146,60',
      ocean: '45,212,191',
      dark: '129,140,248',
    };

    const themeColors2: Record<string, string> = {
      light: '99,102,241',
      aurora: '34,211,238',
      midnight: '167,139,250',
      sunset: '244,114,182',
      ocean: '56,189,248',
      dark: '217,70,239',
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const t = themeRef.current;
      // Density varies by theme
      const base = t === 'light' ? 32000 : t === 'midnight' ? 26000 : 20000;
      const count = Math.min(100, Math.max(45, Math.floor((width * height) / base)));

      particles = Array.from({ length: count }, () => {
        let vx = (Math.random() - 0.5) * 0.35;
        let vy = (Math.random() - 0.5) * 0.35;
        if (t === 'sunset') {
          vx = (Math.random() - 0.5) * 0.15;
          vy = -(0.15 + Math.random() * 0.35); // rise like embers
        } else if (t === 'ocean') {
          vx = (Math.random() > 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.25);
          vy = (Math.random() - 0.5) * 0.08;
        } else if (t === 'aurora') {
          vx = (Math.random() - 0.5) * 0.12;
          vy = (Math.random() - 0.5) * 0.12;
        }
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx,
          vy,
          size: t === 'aurora' ? Math.random() * 3.2 + 1.2 : Math.random() * 2.1 + 0.8,
          opacity: Math.random() * 0.5 + 0.22,
          phase: Math.random() * Math.PI * 2,
        };
      });
    };

    // Rebuild particles when theme changes
    let lastTheme = themeRef.current;

    const draw = (now: number) => {
      if (!running || document.hidden) return;
      raf = requestAnimationFrame(draw);
      if (reduceMotion && now - lastFrame < 100) return;
      if (!reduceMotion && now - lastFrame < 33) return;
      lastFrame = now;

      if (themeRef.current !== lastTheme) {
        lastTheme = themeRef.current;
        resize();
      }

      ctx.clearRect(0, 0, width, height);

      // With wallpaper: keep particles very subtle so the image stays sharp
      const hasWp = !!wallpaperRef.current;
      const globalAlpha = hasWp ? 0.18 : 1;

      const t = themeRef.current;
      const color = themeColors[t] || themeColors.dark;
      const color2 = themeColors2[t] || themeColors2.dark;
      const linkDist = t === 'midnight' ? 160 : t === 'aurora' ? 100 : 135;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.phase += 0.02;

        if (t === 'aurora') {
          // Soft pulse drift
          p.x += p.vx + Math.sin(p.phase) * 0.15;
          p.y += p.vy + Math.cos(p.phase * 0.8) * 0.12;
        } else if (t === 'ocean') {
          p.x += p.vx;
          p.y += p.vy + Math.sin(p.phase + p.x * 0.01) * 0.25;
        } else if (t === 'sunset') {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
        } else {
          p.x += p.vx;
          p.y += p.vy;
        }

        if (t !== 'sunset') {
          if (p.x <= 0 || p.x >= width) p.vx *= -1;
          if (p.y <= 0 || p.y >= height) p.vy *= -1;
        }

        const pulse = t === 'aurora' ? 0.65 + Math.sin(p.phase) * 0.35 : 1;
        const op = p.opacity * globalAlpha * pulse;

        // Soft glow core
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        const useSecond = i % 3 === 0;
        const c = useSecond ? color2 : color;
        g.addColorStop(0, `rgba(${c},${op})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c},${Math.min(1, op * 1.2)})`;
        ctx.fill();

        // Links (skip on light / heavy wallpaper to stay clean)
        if (t === 'light' && !hasWp) {
          // fewer links
        }
        if (!hasWp || t === 'dark' || t === 'midnight') {
          for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < linkDist * linkDist) {
              const alpha = (1 - Math.sqrt(distSq) / linkDist) * 0.14 * globalAlpha;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.strokeStyle = `rgba(${color},${alpha})`;
              ctx.lineWidth = t === 'aurora' ? 0.8 : 0.55;
              ctx.stroke();
            }
          }
        }
      }
    };

    const onVisibility = () => {
      const wasRunning = running;
      running = !document.hidden;
      // Note: deliberately NOT clearing the canvas here. Wiping it while
      // hidden left a blank frame sitting on screen for the split second
      // between the tab becoming visible again and the next draw() call
      // actually running — that blank flash was the one-time flicker seen
      // on tab switch. The last drawn frame is invisible anyway while the
      // tab is hidden, so just leaving it in place is both cheaper and
      // flicker-free; draw() clears + redraws it fresh the moment we resume.
      if (running && !wasRunning) {
        lastFrame = 0;
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="app-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="particles-canvas" />
    </div>
  );
}
