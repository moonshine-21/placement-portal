import { useEffect, useRef, useState } from 'react';
import { useTheme, getWallpaper } from '@/lib/theme';
import { getThemeEnvironment, type ThemeEnvironment } from '@/lib/themeEnvironment';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  phase: number;
  depth: number;
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

function applyGlassTokens(env: ThemeEnvironment) {
  const root = document.documentElement;
  root.style.setProperty('--glass-tint', env.glass.tint);
  root.style.setProperty('--glass-border', env.glass.border);
  root.style.setProperty('--glass-highlight', env.glass.highlight);
  root.style.setProperty('--glass-blur', `${env.glass.blur}px`);
  root.style.setProperty('--glass-saturate', `${env.glass.saturate}%`);
  root.style.setProperty('--ambient-a', env.colors.ambientA);
  root.style.setProperty('--ambient-b', env.colors.ambientB);
}

/**
 * Single optimized particle engine. Theme config drives behavior —
 * never restarts the RAF loop on navigation, only retunes on theme change.
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
    applyGlassTokens(getThemeEnvironment(theme));
  }, [theme]);

  useEffect(() => {
    const onChange = () => setWallpaperState(getWallpaper());
    window.addEventListener('storage', onChange);
    window.addEventListener('wallpaper-change', onChange as EventListener);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('wallpaper-change', onChange as EventListener);
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
    let lastTheme = themeRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const seedParticles = (env: ThemeEnvironment) => {
      const count = Math.min(110, Math.max(36, Math.floor((width * height) / env.particle.countFactor)));
      const speed = env.particle.speed;
      particles = Array.from({ length: count }, () => {
        const depth = Math.random();
        let vx = (Math.random() - 0.5) * speed;
        let vy = (Math.random() - 0.5) * speed;
        switch (env.particle.type) {
          case 'embers':
            vx = (Math.random() - 0.5) * speed * 0.4;
            vy = -(0.12 + Math.random() * speed);
            break;
          case 'snow':
            vx = (Math.random() - 0.5) * speed * 0.5;
            vy = 0.08 + Math.random() * speed * 0.7;
            break;
          case 'dust':
            vx = (Math.random() - 0.5) * speed * 0.6;
            vy = (Math.random() - 0.5) * speed * 0.4;
            break;
          case 'stars':
            vx = (Math.random() - 0.5) * speed * depth;
            vy = (Math.random() - 0.5) * speed * depth;
            break;
          case 'dust-soft':
            vx = (Math.random() - 0.5) * speed;
            vy = (Math.random() - 0.5) * speed;
            break;
          default:
            break;
        }
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx,
          vy,
          size: env.particle.sizeMin + Math.random() * (env.particle.sizeMax - env.particle.sizeMin),
          opacity: 0.2 + Math.random() * 0.55,
          phase: Math.random() * Math.PI * 2,
          depth,
        };
      });
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
      seedParticles(getThemeEnvironment(themeRef.current));
    };

    const draw = (now: number) => {
      if (!running || document.hidden) return;
      raf = requestAnimationFrame(draw);
      if (reduceMotion && now - lastFrame < 100) return;
      if (!reduceMotion && now - lastFrame < 33) return;
      lastFrame = now;

      if (themeRef.current !== lastTheme) {
        lastTheme = themeRef.current;
        seedParticles(getThemeEnvironment(lastTheme));
      }

      const env = getThemeEnvironment(themeRef.current);
      const hasWp = !!wallpaperRef.current;
      const globalAlpha = hasWp ? 0.15 : 1;

      ctx.clearRect(0, 0, width, height);

      const c1 = env.colors.particle;
      const c2 = env.colors.particle2;
      const linkDist = env.particle.linkDistance;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.phase += 0.018 + p.depth * 0.01;

        switch (env.particle.type) {
          case 'embers':
            p.x += p.vx + Math.sin(p.phase) * 0.12;
            p.y += p.vy;
            if (p.y < -12) {
              p.y = height + 8;
              p.x = Math.random() * width;
            }
            break;
          case 'snow':
            p.x += p.vx + Math.sin(p.phase) * 0.2;
            p.y += p.vy;
            if (p.y > height + 10) {
              p.y = -8;
              p.x = Math.random() * width;
            }
            break;
          case 'dust':
            p.x += p.vx + Math.sin(p.phase + p.y * 0.01) * 0.2;
            p.y += p.vy + Math.cos(p.phase * 0.7) * 0.15;
            break;
          case 'stars':
            p.x += p.vx * (0.4 + p.depth);
            p.y += p.vy * (0.4 + p.depth);
            break;
          case 'fireflies':
            p.x += p.vx + Math.sin(p.phase) * 0.35;
            p.y += p.vy + Math.cos(p.phase * 1.1) * 0.35;
            break;
          default:
            p.x += p.vx;
            p.y += p.vy;
        }

        if (env.particle.type !== 'embers' && env.particle.type !== 'snow') {
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
        }

        const pulse =
          env.particle.type === 'fireflies' || env.particle.type === 'stars'
            ? 0.55 + Math.sin(p.phase) * 0.45
            : 1;
        const op = p.opacity * globalAlpha * pulse;
        const col = i % 4 === 0 ? c2 : c1;
        const glowR = p.size * env.particle.glow;

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        g.addColorStop(0, `rgba(${col},${op})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + p.depth * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col},${Math.min(1, op * 1.25)})`;
        ctx.fill();

        if (linkDist > 0 && !hasWp) {
          for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < linkDist * linkDist) {
              const alpha = (1 - Math.sqrt(distSq) / linkDist) * env.particle.lineOpacity * globalAlpha;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.strokeStyle = `rgba(${c1},${alpha})`;
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }
      }
    };

    const onVisibility = () => {
      const wasRunning = running;
      running = !document.hidden;
      if (!running) ctx.clearRect(0, 0, width, height);
      else if (!wasRunning) {
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
