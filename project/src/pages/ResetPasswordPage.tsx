import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Eye, EyeOff, KeyRound, ArrowRight } from 'lucide-react';

export function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // Sign out of the recovery session and send the user back to a normal
    // sign-in with their new password, rather than silently dropping them
    // into the dashboard on a token that came from an email link.
    await supabase.auth.signOut();
    onDone();
    showToast('Password updated. Please sign in with your new password.', 'success');
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    onDone();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="glass w-full max-w-md p-8 animate-fade-in-scale">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-lg">
            <KeyRound size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Set a New Password
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Choose a new password for your account.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 animate-slide-down">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
                autoFocus
                className="input-field pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Confirm New Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              minLength={6}
              autoComplete="new-password"
              className="input-field"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary btn-lg w-full mt-2">
            {loading ? 'Updating…' : 'Update Password'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          <button
            type="button"
            onClick={handleCancel}
            className="font-semibold hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Cancel and back to sign in
          </button>
        </p>
      </div>
    </div>
  );
}
