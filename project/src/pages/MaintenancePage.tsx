// ============================================================================
// src/pages/MaintenancePage.tsx
//
// WHAT THIS FILE IS: the "we'll be right back" screen, shown to EVERY
// visitor (in place of the entire rest of the site) whenever an admin
// turns on the 'maintenance_mode' feature flag (see src/lib/featureFlags.tsx
// and App.tsx, which is what checks the flag and decides to show this page
// instead of the real app).
// ============================================================================

import { Wrench } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export function MaintenancePage() {
  // Even during maintenance, we still want a signed-in visitor to be able
  // to log out (e.g. if they're on a shared computer) — so we still need
  // access to the auth state here.
  const { session, signOut } = useAuth();

  return (
    // Center a single card in the middle of an otherwise empty screen.
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md p-8 text-center animate-fade-in-scale">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-lg">
          <Wrench size={30} className="text-white" />
        </div>
        <h1 className="mb-2 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          We'll be right back
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          SmartCell is currently down for scheduled maintenance. Please check back shortly — your
          account and data are safe.
        </p>
        {/* Only show a Sign Out button if someone actually has a session —
            no point showing it to a visitor who was never logged in. */}
        {session && (
          <button onClick={() => signOut()} className="btn-secondary mt-6 w-full">
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
