// ============================================================================
// src/lib/toast.tsx
//
// WHAT THIS FILE IS: the little pop-up messages that briefly appear in the
// corner of the screen (e.g. "Application submitted!" or "Something went
// wrong") are called "toasts" — like a slice of toast popping out of a
// toaster, they appear, sit for a moment, then disappear on their own.
//
// This file, like theme.tsx, uses React Context so that ANY component
// anywhere in the app can trigger a toast message with one simple function
// call — `showToast("some message")` — without needing to know or care
// how the toast pop-up itself is actually drawn on screen.
// ============================================================================

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// The three visual styles a toast can have — 'info' (neutral, blue),
// 'success' (green), or 'error' (red).
export type ToastType = 'info' | 'success' | 'error';

// One toast message, as it's tracked internally.
type Toast = {
  id: number;       // a unique number so React can tell toasts apart and remove the right one later
  message: string;
  type: ToastType;
};

// What we broadcast over Context: just the one function components need.
type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void; // `type?` means this argument is optional
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Wraps the whole app (see src/main.tsx) so any component inside can call
// `useToast().showToast(...)`.
export function ToastProvider({ children }: { children: ReactNode }) {
  // The list of toasts CURRENTLY visible on screen. Usually 0 or 1, but
  // it's a list so multiple toasts can stack up if several things happen
  // in quick succession.
  const [toasts, setToasts] = useState<Toast[]>([]);

  // `useCallback` here just means "don't rebuild this function from
  // scratch on every single re-render" — a small performance detail that
  // doesn't change what the function does.
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    // Build a unique ID for this toast. Combining the current time with a
    // random decimal makes it extremely unlikely two toasts ever get the
    // same ID, even if triggered in the same instant.
    const id = Date.now() + Math.random();

    // Add the new toast to the end of the list. `(prev) => [...prev, {...}]`
    // means "take whatever the list currently is, and return a NEW list
    // that's everything from before, plus this one new toast at the end."
    // React requires we build a brand new list rather than modifying the
    // old one directly — that's how React knows something changed and it
    // needs to re-draw the screen.
    setToasts((prev) => [...prev, { id, message, type }]);

    // After 4 seconds (4000 milliseconds), automatically remove this exact
    // toast (by matching its unique id) — this is what makes toasts
    // disappear on their own instead of needing a close button.
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {/* Render whatever the rest of the app is (this component doesn't
          change any of that — it just also adds the toast pop-ups on top). */}
      {children}

      {/* The actual toast pop-ups, pinned to the bottom-right corner of
          the screen (`fixed bottom-6 right-6`), stacked vertically
          (`flex flex-col gap-3`), always on top of everything else
          (`z-[200]`). `pointer-events-none` on this wrapper means clicks
          pass THROUGH the empty space around the toasts to whatever's
          behind them — only the toast boxes themselves are clickable
          (see `pointer-events-auto` below). */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        {/* Draw one box per toast currently in the list. */}
        {toasts.map((t) => (
          <div
            key={t.id} // React uses `key` to track which box is which across re-renders — required whenever rendering a list
            // Pick different background/border/text colors depending on
            // whether this is a success, error, or plain info toast.
            className={`toast-enter pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl backdrop-blur-xl border min-w-[280px] max-w-sm
              ${t.type === 'success' ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100'
              : t.type === 'error' ? 'bg-rose-500/15 border-rose-400/30 text-rose-100'
              : 'bg-sky-500/15 border-sky-400/30 text-sky-100'}`}
          >
            {/* A small colored dot, matching the toast's type, for a
                quick at-a-glance visual cue. */}
            <span className={`h-2 w-2 rounded-full flex-shrink-0
              ${t.type === 'success' ? 'bg-emerald-400'
              : t.type === 'error' ? 'bg-rose-400'
              : 'bg-sky-400'}`} />
            <span className="text-sm font-medium leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// The function components call to get access to `showToast`.
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
