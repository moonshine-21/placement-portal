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

  // While the ban check is still in flight, render the real app
  // (`children`) right away instead of blocking on it. Previously this
  // showed a loading spinner and returned early here — which meant
  // NOTHING nested inside SessionGuard (FeatureFlagsProvider,
  // AuthProvider, and everything they load: feature flags, your login
  // session, your profile) could even start fetching until this one
  // ban-check request finished. That serialized an otherwise-parallel
  // chain of network requests into one long queue, which is what was
  // actually behind the multi-second delay-then-flicker on every load —
  // not a rendering/CSS bug. The overwhelming majority of visitors
  // aren't banned, so optimistically showing the app while this resolves
  // in the background, and swapping to the "Access Restricted" screen
  // the moment a ban IS confirmed, gives real (non-banned) visitors a
  // fast load without weakening the block itself — a banned visitor
  // still gets stopped, just a beat later instead of before anything
  // else could even begin loading.
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
