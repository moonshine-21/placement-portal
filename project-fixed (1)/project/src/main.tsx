// ============================================================================
// src/main.tsx
//
// WHAT THIS FILE IS: the very first file that runs when someone opens this
// website. It's the "ignition switch" — its only job is to find the empty
// <div id="root"></div> in index.html and tell React "build the entire
// app inside this div." Everything else in the project (App.tsx, and
// everything App.tsx uses) only exists because this file kicks it off.
// ============================================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css'; // the site's global stylesheet (colors, fonts, spacing rules, etc)

// A tiny visible marker so it's possible to confirm, just by opening the
// browser console (F12 → Console tab), whether the browser is actually
// running THIS build or an older cached one — no guessing needed. If you
// deploy an update and don't see this line (with today's tag) in the
// console after a hard refresh, the browser/CDN is still serving an old
// build, not this code.
console.log('[build] no-particles-no-blur-v12-2026-08-20');

// `document.getElementById('root')` finds that empty <div> in index.html.
// The `!` right after it tells TypeScript "trust me, this will never be
// null" (it's set up by index.html, which we control, so we know for sure
// it's there).
createRoot(document.getElementById('root')!).render(
  // <StrictMode> is a React development tool, not something visitors ever
  // see — it doesn't render any visible HTML. During development, it
  // deliberately runs certain things twice to help catch bugs (like code
  // that accidentally has side effects it shouldn't). It has no effect on
  // the final, real, deployed version of the site.
  <StrictMode>
    <App />
  </StrictMode>
);
