// ============================================================================
// src/components/AnchoredPortal.tsx
//
// WHAT THIS FILE IS: a tiny helper that renders a popover/dropdown's content
// into document.body (via a React Portal) instead of directly inside the
// header. This guarantees the popover can never be clipped by an ancestor's
// `overflow: hidden` (the app shell uses that on purpose for flicker
// stability — see AppShell.tsx) and always paints above every other layer.
//
// It positions itself with `position: fixed`, computed once from the
// trigger element's bounding box each time it opens (and re-measured on
// scroll/resize while open). Nothing here is animated on a frame loop —
// it only recalculates on real user events, so it does not reintroduce any
// of the compositor churn described in FLICKER_ROOT_CAUSE.md.
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type Align = 'left' | 'right';

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  align?: Align;    // which side of the trigger the panel's edge lines up with
  offset?: number;  // gap between the trigger and the panel, in px
  children: ReactNode;
};

export function AnchoredPortal({ open, anchorRef, onClose, align = 'right', offset = 10, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  const measure = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (align === 'right') {
      setPos({ top: rect.bottom + offset, right: Math.max(8, window.innerWidth - rect.right) });
    } else {
      setPos({ top: rect.bottom + offset, left: Math.max(8, rect.left) });
    }
  };

  // Measure synchronously before paint so the panel never flashes at (0,0).
  useLayoutEffect(() => {
    if (open) measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => measure();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // capture:true on scroll so it fires even for scroll containers other
    // than window (e.g. the main content region scrolling under a fixed header).
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="anchored-portal-panel"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        right: pos.right,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
