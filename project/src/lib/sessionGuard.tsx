// ============================================================================
// src/lib/sessionGuard.tsx
//
// WHAT THIS FILE IS: a "bouncer at the door" component that wraps the
// ENTIRE app (see src/main.tsx) and checks, before showing anything else,
// whether this visitor's device or network has been banned by an admin. If
// they're banned, they see an "Access Restricted" screen instead of the
// real site — no amount of clicking around or refreshing gets them past
// this check, since it runs on every single page load, before anything
// else in the app is shown.
//
// Note this is a DIFFERENT kind of ban from banning a specific user
// ACCOUNT (see Profile.is_banned in supabase.ts) — this one blocks based
// on the device/browser/network itself, so it works even against someone
// who hasn't logged in, or who creates a brand new account to get around
// an account-level ban.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { Ban } from 'lucide-react'; // a "no entry" style icon from the icon library this project uses
import { supabase } from './supabase';
import { collectDeviceInfo } from './deviceFingerprint';

// The three possible states of this check:
//   'checking' — we're still waiting to hear back from the server
//   'clear'    — this visitor is allowed through
//   'banned'   — this visitor is blocked
type GuardState = 'checking' | 'clear' | 'banned';

export function SessionGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuardState>('checking'); // start out assuming nothing, until we hear back
  const [reason, setReason] = useState(''); // if banned, why (shown to the visitor, if the admin provided one)

  useEffect(() => {
    // A simple safety flag: if this component gets removed from the page
    // WHILE we're still waiting for the network request below to finish,
    // we don't want to try updating its state afterward (React would warn
    // about "updating state on an unmounted component"). Checking
    // `cancelled` before each `setState` call below prevents that.
    let cancelled = false;

    // An "immediately-invoked async function" — this odd `(async () => {
    // ... })()` pattern lets us use `await` inside a useEffect, since
    // useEffect itself isn't allowed to be async directly.
    (async () => {
      try {
        // Gather two pieces of information AT THE SAME TIME (Promise.all
        // runs both of these in parallel instead of one after another,
        // which is faster):
        //   1. collectDeviceInfo() — a fingerprint identifying this
        //      specific browser/device (see deviceFingerprint.ts)
        //   2. the current login session, if the visitor happens to
        //      already be logged in
        const [{ fingerprint, details }, { data: sessionData }] = await Promise.all([
          collectDeviceInfo(),
          supabase.auth.getSession(),
        ]);

        // Send this information to our own server, which checks it
        // against the list of banned devices/IPs (see api/track-session.ts)
        // and also records this visit for security tracking.
        const res = await fetch('/api/track-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fingerprint,
            details,
            userId: sessionData.session?.user?.id || null, // include their user ID if logged in, otherwise null
          }),
        });

        if (!res.ok) {
          // Network hiccup or the endpoint being briefly unavailable should
          // never lock legitimate visitors out — fail open.
          if (!cancelled) setState('clear');
          return;
        }

        const data = await res.json();
        if (cancelled) return;
        if (data.banned) {
          setReason(data.reason || '');
          setState('banned');
        } else {
          setState('clear');
        }
      } catch (err) {
        // If anything unexpected went wrong (e.g. no internet connection
        // at all), same principle as above: don't punish a real visitor
        // for a technical problem — let them through, but log the error
        // so a developer can notice the pattern if it keeps happening.
        console.error('[SessionGuard] check failed, letting visitor through:', err);
        if (!cancelled) setState('clear');
      }
    })();

    // Cleanup: mark this check as cancelled if the component disappears
    // before the network request finishes.
    return () => { cancelled = true; };
  }, []); // run this once, when the app first loads — not on every re-render

  // While we're still waiting to hear back, show a simple loading
  // animation instead of the real site (so nothing "flashes" on screen
  // before we know whether this visitor is allowed to see it).
  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="typing-dots"><span></span><span></span><span></span></div>
      </div>
    );
  }

  // If banned, show the "Access Restricted" screen and STOP — notice this
  // return happens instead of ever rendering `{children}` (the real app),
  // so a banned visitor never sees anything else no matter what page they
  // tried to load.
  if (state === 'banned') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
            <Ban size={28} className="text-rose-400" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">Access Restricted</h1>
          <p className="mb-1 text-sm text-[var(--text-secondary)]">
            This device or network has been blocked from accessing SmartCell.
          </p>
          {reason && <p className="mb-1 text-sm text-[var(--text-muted)]">Reason: {reason}</p>}
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            If you believe this is a mistake, contact your placement cell administrators.
          </p>
        </div>
      </div>
    );
  }

  // Not banned — show the real app. `<>...</>` is a "React Fragment," a
  // way of grouping `{children}` without adding an extra, unnecessary
  // wrapper <div> to the page's HTML.
  return <>{children}</>;
}
