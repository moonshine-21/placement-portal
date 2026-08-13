import { Wrench } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export function MaintenancePage() {
  const { session, signOut } = useAuth();

  return (
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
        {session && (
          <button onClick={() => signOut()} className="btn-secondary mt-6 w-full">
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
