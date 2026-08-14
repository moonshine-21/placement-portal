// ============================================================================
// src/components/Portal.tsx
//
// WHAT THIS FILE IS: a tiny wrapper that renders its children directly
// onto `document.body`, instead of wherever it happens to sit in the
// component tree.
//
// WHY THIS MATTERS: every modal in this app uses `position: fixed` to
// cover the whole screen. But `position: fixed` isn't ALWAYS relative to
// the actual browser window — CSS has an obscure rule that if ANY parent
// element has a `transform` (even something as invisible as
// `transform: translateY(0)`, which is what `.animate-fade-in`'s
// keyframe animation leaves behind once it finishes, because of its
// `animation-fill-mode: both`), then `position: fixed` inside it becomes
// relative to THAT parent instead of the real screen. Since every view
// (DashboardView, QuizzesView, etc) gets wrapped in an `.animate-fade-in`
// div by AppShell, any modal rendered from inside a view inherits this
// problem: it ends up positioned/sized relative to the content area
// instead of the whole page, which is what caused it to look broken —
// not covering the sidebar, letting the background show through, and
// generally rendering in the wrong place.
//
// Rendering the modal's content into `document.body` directly (which is
// what `createPortal` does below) sidesteps the whole issue: `document.
// body` isn't inside any transformed ancestor, so `position: fixed`
// inside a Portal always means "relative to the real screen," no matter
// where in the component tree the Portal itself was written.
// ============================================================================

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
