import { useEffect, useRef, useState } from 'react';
import { useTheme, getWallpaper } from '@/lib/theme';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
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
 * Lightweight constellation background.
 *
 * Important stability rule: the canvas is the ONLY continuously animated
 * layer. The sidebar never blurs it, and the main glass effect is supplied
 * by one fixed glass stage in AppShell rather than dozens of moving blur
 * surfaces. The loop is capped at 30fps, uses a low particle count, pauses
 * when the tab is hidden, and caps devicePixelRatio to keep the GPU load low.
 */
export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
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

    const colors: Record<string, string> = {
      light: '2,132,199',
      aurora: '129,140,248',
      midnight: '96,165,250',
      sunset: '251,146,60',
      ocean: '45,212,191',
      dark: '111,107,250',
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

      // Keep it visibly alive but deliberately much lighter than the old 90-dot loop.
      const count = Math.min(64, Math.max(28, Math.floor((width * height) / 30000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        size: Math.random() * 1.6 + 0.7,
        opacity: Math.random() * 0.42 + 0.18,
      }));
    };

    const draw = (now: number) => {
      if (!running || document.hidden) return;
      raf = requestAnimationFrame(draw);
      if (reduceMotion && now - lastFrame < 100) return; // ~10fps with reduced motion
      if (!reduceMotion && now - lastFrame < 20) return; // ~50fps
      lastFrame = now;

      ctx.clearRect(0, 0, width, height);
      const color = colors[themeRef.current] || colors.dark;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x <= 0 || p.x >= width) p.vx *= -1;
        if (p.y <= 0 || p.y >= height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${p.opacity})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 125 * 125) {
            const alpha = (1 - Math.sqrt(distSq) / 125) * 0.12;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(${color},${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }
    };

    const onVisibility = () => {
      running = !document.hidden;
      if (!running) {
        ctx.clearRect(0, 0, width, height);
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
