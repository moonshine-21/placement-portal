import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Eye, EyeOff, GraduationCap, ArrowRight } from 'lucide-react';

export function LoginPage() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'signin') {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) {
        const msg = err.message || '';
        if (/rate limit|too many|over the limit|for security purposes|429/i.test(msg)) {
          setError('Too many attempts in a short time. Wait a minute and try again.');
        } else {
          setError(msg);
        }
        return;
      }
      if (data.session) showToast('Welcome back!', 'success');
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setLoading(false);
      if (err) {
        const msg = err.message || '';
        if (/already registered|already exists|user already registered/i.test(msg)) {
          setError('An account with this email already exists. Please sign in instead.');
        } else if (/rate limit|too many/i.test(msg)) {
          setError('Too many attempts. Wait a minute and try again.');
        } else {
          setError(msg);
        }
        return;
      }
      if (!err && data.user && data.user.identities && data.user.identities.length === 0) {
        setError('An account with this email already exists. Please sign in instead.');
        return;
      }
      if (data.session) {
        showToast('Account created!', 'success');
      } else if (data.user) {
        showToast('Account created — check your email to confirm, then sign in.', 'info');
      }
    }
  };

  const handleGoogle = async () => {
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(err.message);
  };

  const handleForgot = async () => {
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?".');
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (err) {
      if (/rate limit|too many/i.test(err.message)) {
        setError('Too many reset emails sent recently. Wait a few minutes and try again.');
      } else {
        setError(err.message);
      }
    } else {
      setResetSent(true);
      setError('');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="glass w-full max-w-md p-8 animate-fade-in-scale">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-lg">
            <GraduationCap size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {mode === 'signin' ? 'Smart Placement Cell' : 'Create Account'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            AI Resume &amp; Eligibility System
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 animate-slide-down">
            {error}
          </div>
        )}

        {/* Reset sent */}
        {resetSent && (
          <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 animate-slide-down">
            If an account exists for that email, a password reset link has been sent. Check your inbox.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Full name — signup only */}
          {mode === 'signup' && (
            <div className="animate-slide-down">
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                required
                autoComplete="name"
                className="input-field"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@college.edu"
              required
              autoComplete="email"
              className="input-field"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
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
            {mode === 'signin' && (
              <button
                type="button"
                onClick={handleForgot}
                className="mt-2 text-xs transition-colors hover:underline"
                style={{ color: 'var(--text-muted)' }}
              >
                Forgot password?
              </button>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-lg w-full mt-2"
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or</span>
          <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
        </div>

        {/* Google */}
        <button onClick={handleGoogle} className="btn-ghost btn-lg w-full">
          <svg viewBox="0 0 24 24" width="20" height="20" className="flex-shrink-0">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {/* Toggle mode */}
        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          {mode === 'signin' ? 'New student?' : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setResetSent(false);
            }}
            className="font-semibold hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in instead'}
          </button>
        </p>
      </div>
    </div>
  );
}
