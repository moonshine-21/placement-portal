// Central theme environment — each theme is a different visual world.
import type { Theme } from '@/lib/theme';

export type ParticleType =
  | 'constellation' // cyberpunk nodes + lines
  | 'dust'          // ocean floating dust
  | 'embers'        // rising sparks
  | 'stars'         // galaxy starfield
  | 'snow'          // arctic crystals
  | 'fireflies'     // soft pulsing dots, no lines
  | 'dust-soft';    // minimal macos

export type ThemeEnvironment = {
  id: Theme;
  label: string;
  world: string;
  particle: {
    type: ParticleType;
    countFactor: number; // lower = fewer
    speed: number;
    linkDistance: number; // 0 = no links
    lineOpacity: number;
    glow: number;
    sizeMin: number;
    sizeMax: number;
  };
  colors: {
    particle: string;   // rgb triplet
    particle2: string;
    ambientA: string;   // css color for bg orb
    ambientB: string;
  };
  glass: {
    tint: string;       // rgba for panel fill
    border: string;
    highlight: string;
    blur: number;
    saturate: number;
  };
};

export const THEME_ENVIRONMENTS: Record<Theme, ThemeEnvironment> = {
  dark: {
    id: 'dark',
    label: 'Dark',
    world: 'Cyberpunk Command',
    particle: {
      type: 'constellation',
      countFactor: 20000,
      speed: 0.38,
      linkDistance: 140,
      lineOpacity: 0.16,
      glow: 2.8,
      sizeMin: 0.9,
      sizeMax: 2.2,
    },
    colors: {
      particle: '129,140,248',
      particle2: '217,70,239',
      ambientA: 'rgba(99,102,241,0.45)',
      ambientB: 'rgba(217,70,239,0.3)',
    },
    glass: {
      tint: 'rgba(18, 16, 36, 0.42)',
      border: 'rgba(167,139,250,0.18)',
      highlight: 'rgba(255,255,255,0.10)',
      blur: 20,
      saturate: 155,
    },
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    world: 'Abyssal Interface',
    particle: {
      type: 'dust',
      countFactor: 24000,
      speed: 0.14,
      linkDistance: 0,
      lineOpacity: 0,
      glow: 3.5,
      sizeMin: 0.7,
      sizeMax: 2.8,
    },
    colors: {
      particle: '45,212,191',
      particle2: '56,189,248',
      ambientA: 'rgba(13,148,136,0.4)',
      ambientB: 'rgba(14,165,233,0.28)',
    },
    glass: {
      tint: 'rgba(8, 28, 36, 0.40)',
      border: 'rgba(45,212,191,0.16)',
      highlight: 'rgba(165,243,252,0.08)',
      blur: 22,
      saturate: 150,
    },
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora',
    world: 'Galaxy OS',
    particle: {
      type: 'stars',
      countFactor: 16000,
      speed: 0.08,
      linkDistance: 0,
      lineOpacity: 0,
      glow: 4,
      sizeMin: 0.4,
      sizeMax: 2.6,
    },
    colors: {
      particle: '196,181,253',
      particle2: '251,207,232',
      ambientA: 'rgba(99,102,241,0.35)',
      ambientB: 'rgba(236,72,153,0.22)',
    },
    glass: {
      tint: 'rgba(20, 16, 40, 0.40)',
      border: 'rgba(167,139,250,0.2)',
      highlight: 'rgba(255,255,255,0.09)',
      blur: 22,
      saturate: 160,
    },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    world: 'Arctic Glass',
    particle: {
      type: 'snow',
      countFactor: 18000,
      speed: 0.22,
      linkDistance: 0,
      lineOpacity: 0,
      glow: 2.2,
      sizeMin: 0.6,
      sizeMax: 2.0,
    },
    colors: {
      particle: '186,230,253',
      particle2: '224,242,254',
      ambientA: 'rgba(56,189,248,0.28)',
      ambientB: 'rgba(147,197,253,0.18)',
    },
    glass: {
      tint: 'rgba(10, 18, 32, 0.38)',
      border: 'rgba(147,197,253,0.2)',
      highlight: 'rgba(255,255,255,0.12)',
      blur: 24,
      saturate: 145,
    },
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    world: 'Ember Forge',
    particle: {
      type: 'embers',
      countFactor: 22000,
      speed: 0.45,
      linkDistance: 0,
      lineOpacity: 0,
      glow: 3.2,
      sizeMin: 0.8,
      sizeMax: 2.4,
    },
    colors: {
      particle: '251,146,60',
      particle2: '244,114,182',
      ambientA: 'rgba(234,88,12,0.4)',
      ambientB: 'rgba(244,63,94,0.25)',
    },
    glass: {
      tint: 'rgba(28, 14, 12, 0.42)',
      border: 'rgba(251,146,60,0.18)',
      highlight: 'rgba(255,237,213,0.08)',
      blur: 20,
      saturate: 150,
    },
  },
  light: {
    id: 'light',
    label: 'Light',
    world: 'Minimal OS',
    particle: {
      type: 'dust-soft',
      countFactor: 36000,
      speed: 0.1,
      linkDistance: 0,
      lineOpacity: 0,
      glow: 1.6,
      sizeMin: 0.5,
      sizeMax: 1.4,
    },
    colors: {
      particle: '100,116,139',
      particle2: '148,163,184',
      ambientA: 'rgba(148,163,184,0.2)',
      ambientB: 'rgba(96,165,250,0.12)',
    },
    glass: {
      tint: 'rgba(255, 255, 255, 0.52)',
      border: 'rgba(15,23,42,0.10)',
      highlight: 'rgba(255,255,255,0.55)',
      blur: 24,
      saturate: 130,
    },
  },
};

export function getThemeEnvironment(theme: Theme): ThemeEnvironment {
  return THEME_ENVIRONMENTS[theme] || THEME_ENVIRONMENTS.dark;
}
