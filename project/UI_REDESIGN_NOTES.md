# Placement Portal — UI/Flicker Redesign

## Root cause found

The old shell combined several compositor-sensitive mechanisms at the same time:

1. A fixed sidebar used `backdrop-filter` and `will-change: backdrop-filter` while a continuously animated canvas/wallpaper was behind it.
2. The active sidebar state was a second absolutely positioned blurred glass element that moved with `transform` based on an assumed 44px row height.
3. The application had document scrolling (`html { overflow-y: scroll; }`) and a second scrolling container inside the shell (`main { overflow-y: auto; }`).
4. The shell used `min-h-screen` rather than a strict viewport-height app frame, allowing browser layout and internal scrolling to compete.
5. The visual hierarchy was trying to be both a floating-card dashboard and a Discord workspace at the same time, which made the sidebar/header feel detached and alignment inconsistent.

## Redesign

- Structural sidebar/header glass is now paint-stable: translucent fills, borders, gradients and shadows; no persistent backdrop blur.
- The active navigation item is the actual button. There is no moving active pill and no hard-coded row-height calculation.
- The app shell is a single `100dvh` viewport with `overflow: hidden`.
- Only the main content area scrolls.
- Sidebar navigation has its own stable scroll container.
- Mobile navigation remains a drawer with a real backdrop.
- Header, sidebar, navigation, user footer and cards share one design system.
- Popover glass blur is retained for short-lived theme/notification menus where it is much less likely to cause continuous compositor churn.
- Particle density and speed were reduced to lower background GPU pressure while preserving the futuristic atmosphere.
- Existing routes, views, Supabase logic, authentication, feature flags and business functionality were intentionally left intact.

## Validation note

The source was edited directly from the supplied project. A local TypeScript/build validation could not be completed in this environment because dependency installation (`npm ci`) timed out, so deploy and run `npm run typecheck` + `npm run build` locally/CI before production.
