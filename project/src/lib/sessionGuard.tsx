import { useEffect, useState, type ReactNode } from 'react';
import { Ban } from 'lucide-react';
import { supabase } from './supabase';
import { collectDeviceInfo } from './deviceFingerprint';

type GuardState = 'checking' | 'clear' | 'banned';

export function SessionGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuardState>('checking');
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [{ fingerprint, details }, { data: sessionData }] = await Promise.all([
          collectDeviceInfo(),
          supabase.auth.getSession(),
        ]);

        const res = await fetch('/api/track-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fingerprint,
            details,
            userId: sessionData.session?.user?.id || null,
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
        console.error('[SessionGuard] check failed, letting visitor through:', err);
        if (!cancelled) setState('clear');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="typing-dots"><span></span><span></span><span></span></div>
      </div>
    );
  }

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

  return <>{children}</>;
}
