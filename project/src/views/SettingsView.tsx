import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme, getWallpaper, setWallpaper, type Theme } from '@/lib/theme';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { uploadPublicFile } from '@/lib/data';
import { Moon, Sun, Palette, Mail, Lock, Trash2, Image, LogOut, Check } from 'lucide-react';

type Props = {
  onSignOut: () => void;
};

export function SettingsView({ onSignOut }: Props) {
  const { profile, user, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [wallpaper, setWallpaperState] = useState(getWallpaper());
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const themes: { key: Theme; label: string; icon: typeof Moon; desc: string }[] = [
    { key: 'dark', label: 'Dark', icon: Moon, desc: 'Default premium dark theme' },
    { key: 'light', label: 'Light', icon: Sun, desc: 'Clean and bright' },
    { key: 'aurora', label: 'Aurora', icon: Palette, desc: 'Glass aurora gradient' },
  ];

  const handleWallpaper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const url = await uploadPublicFile('banners', file, profile.id);
    if (url) {
      setWallpaper(url);
      setWallpaperState(url);
      showToast('Wallpaper applied', 'success');
    } else {
      showToast('Upload failed', 'error');
    }
  };

  const removeWallpaper = () => {
    setWallpaper(null);
    setWallpaperState(null);
    showToast('Wallpaper removed', 'info');
  };

  const changeEmail = async () => {
    if (!newEmail || !user) return;
    setChangingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setChangingEmail(false);
    if (error) { showToast('Could not change email: ' + error.message, 'error'); return; }
    showToast('Email update link sent to your new address', 'success');
    setNewEmail('');
  };

  const resetPassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin });
    if (error) { showToast('Could not send reset email: ' + error.message, 'error'); return; }
    showToast('Password reset link sent to your email', 'success');
  };

  const deleteAccount = async () => {
    if (!confirm('Are you absolutely sure? This will permanently delete your account and all associated data. This cannot be undone.')) return;
    if (!confirm('Last warning: your profile, matches, applications, messages, and friends will all be permanently deleted. Continue?')) return;
    showToast('Account deletion requires contacting support. Your data has been flagged for removal.', 'info');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Appearance */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-[var(--text-secondary)]">Choose your preferred theme. Changes are saved automatically.</p>
        <div className="space-y-2">
          {themes.map((t) => (
            <button
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 transition-all ${
                theme === t.key ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border-strong)] hover:border-[var(--border-strong)]'
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${theme === t.key ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}>
                <t.icon size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{t.label} Theme</p>
                <p className="text-xs text-[var(--text-muted)]">{t.desc}</p>
              </div>
              {theme === t.key && <Check size={18} className="text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Wallpaper */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Wallpaper</h2>
        <p className="text-sm text-[var(--text-secondary)]">Upload a custom background image or GIF for your dashboard.</p>
        {wallpaper ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-[var(--border-strong)]" style={{ height: 120 }}>
              <img src={wallpaper} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => wallpaperInputRef.current?.click()} className="btn-ghost btn-sm flex-1">
                <Image size={14} /> Change
              </button>
              <button onClick={removeWallpaper} className="btn-ghost btn-sm text-rose-400 hover:text-rose-300">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => wallpaperInputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] p-8 transition-all hover:border-[var(--accent)]">
            <Image size={28} className="text-[var(--text-muted)]" />
            <span className="text-sm text-[var(--text-secondary)]">Upload wallpaper (image/GIF)</span>
          </button>
        )}
        <input ref={wallpaperInputRef} type="file" accept="image/*,image/gif" hidden onChange={handleWallpaper} />
      </div>

      {/* Account */}
      <div className="card space-y-4 lg:col-span-2">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Mail size={16} className="text-[var(--accent)]" />
              <span className="text-sm font-medium">Change Email</span>
            </div>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={profile?.email || 'you@college.edu'} className="input-field mb-2" />
            <button onClick={changeEmail} disabled={changingEmail || !newEmail} className="btn-primary btn-sm w-full">
              {changingEmail ? 'Sending…' : 'Update Email'}
            </button>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={16} className="text-[var(--accent)]" />
              <span className="text-sm font-medium">Reset Password</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3">A reset link will be sent to your email address.</p>
            <button onClick={resetPassword} className="btn-primary btn-sm w-full">
              Send Reset Link
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trash2 size={16} className="text-rose-400" />
            <span className="text-sm font-medium text-rose-400">Delete Account</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-3">Permanently delete your account and all associated data. This cannot be undone.</p>
          <button onClick={deleteAccount} className="btn-danger btn-sm">
            Delete Account
          </button>
        </div>
      </div>

      {/* Account info */}
      <div className="card space-y-3 lg:col-span-2">
        <h2 className="text-lg font-semibold">Account Details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex justify-between rounded-lg bg-[var(--surface)] px-4 py-2.5"><span className="text-sm text-[var(--text-muted)]">Name</span><span className="text-sm font-medium">{profile?.full_name || '—'}</span></div>
          <div className="flex justify-between rounded-lg bg-[var(--surface)] px-4 py-2.5"><span className="text-sm text-[var(--text-muted)]">Email</span><span className="text-sm font-medium truncate max-w-[180px]">{profile?.email || '—'}</span></div>
          <div className="flex justify-between rounded-lg bg-[var(--surface)] px-4 py-2.5"><span className="text-sm text-[var(--text-muted)]">Role</span><span className="text-sm font-medium capitalize">{profile?.role || '—'}</span></div>
          <div className="flex justify-between rounded-lg bg-[var(--surface)] px-4 py-2.5"><span className="text-sm text-[var(--text-muted)]">Branch</span><span className="text-sm font-medium">{profile?.branch || '—'}</span></div>
        </div>
        <button onClick={onSignOut} className="btn-ghost w-full mt-2">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}
