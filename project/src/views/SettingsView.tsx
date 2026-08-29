// ============================================================================
// src/views/SettingsView.tsx
//
// WHAT THIS FILE IS: the account settings page — theme picker, custom
// wallpaper upload, change email, reset password, delete account, and a
// read-only summary of account details, plus the sign-out button.
// ============================================================================

import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme, getWallpaper, setWallpaper, type Theme } from '@/lib/theme';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { uploadPublicFile } from '@/lib/data';
import { Moon, Sun, Palette, Mail, Lock, Trash2, Image, LogOut, Check, X } from 'lucide-react';

type Props = {
  onSignOut: () => void; // provided by App.tsx — handles both signing out AND resetting back to the landing page
};

export function SettingsView({ onSignOut }: Props) {
  const { profile, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [wallpaper, setWallpaperState] = useState(getWallpaper());
  const [confirmDelete, setConfirmDelete] = useState(false); // is the app's own (not the browser's native) delete-confirmation popup open?
  const [deleting, setDeleting] = useState(false);
  // A ref pointing at the (hidden) file-picker input, so clicking a
  // styled button elsewhere on the page can trigger it programmatically
  // (`wallpaperInputRef.current?.click()`) rather than needing to be a
  // <label> wrapping the input directly, like the pattern used in
  // ProjectsView.tsx — used here instead because there are TWO different
  // buttons ("Upload" and "Change") that both need to open the same file picker.
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  // The three theme choices, each with an icon and short description —
  // same three values as AppShell.tsx's theme dropdown, just presented
  // here as a bigger, more detailed picker rather than a compact menu.
  const themes: { key: Theme; label: string; icon: typeof Moon; desc: string }[] = [
    { key: 'dark', label: 'Dark', icon: Moon, desc: 'Default premium dark theme' },
    { key: 'light', label: 'Light', icon: Sun, desc: 'Clean and bright' },
    { key: 'aurora', label: 'Aurora', icon: Palette, desc: 'Glass aurora gradient' },
  ];

  // Runs when a wallpaper image is picked.
  const handleWallpaper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    // Prefer uploading it to Supabase's cloud storage (so the wallpaper
    // follows the person to any device they log in on) — but if that
    // fails for any reason (e.g. no internet, storage misconfigured),
    // fall back to encoding the image directly as a "data URL" (a giant
    // text string containing the whole image), which at least still
    // works LOCALLY on this one device/browser.
    let url = await uploadPublicFile('banners', file, profile.id);
    if (!url) {
      url = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    }
    if (url) {
      setWallpaper(url); // saves to localStorage + announces the change (see src/lib/theme.tsx)
      setWallpaperState(url); // update THIS component's own preview immediately
      // Also apply it directly here, right away — belt-and-suspenders
      // alongside the 'wallpaper-change' event ParticleBackground.tsx is
      // already listening for, so there's zero visible delay.
      document.documentElement.style.setProperty('--wallpaper-url', `url("${url}")`);
      document.documentElement.classList.add('has-wallpaper');
      showToast('Wallpaper applied', 'success');
    } else {
      showToast('Upload failed — try a smaller image (JPG/PNG/GIF under 2MB)', 'error');
    }
    e.target.value = ''; // reset the file input so picking the SAME file again still triggers this handler
  };

  const removeWallpaper = () => {
    setWallpaper(null);
    setWallpaperState(null);
    showToast('Wallpaper removed', 'info');
  };

  // Requests an email address change. Supabase doesn't switch it
  // immediately — it sends a confirmation link to the NEW address first,
  // and the change only takes effect once that link is clicked (a
  // standard security precaution, so nobody can silently hijack an
  // account by changing its email without access to that inbox).
  const changeEmail = async () => {
    if (!newEmail || !user) return;
    setChangingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setChangingEmail(false);
    if (error) { showToast('Could not change email: ' + error.message, 'error'); return; }
    showToast('Email update link sent to your new address', 'success');
    setNewEmail('');
  };

  // Sends a password-reset email to the account's CURRENT address (this
  // is the same reset flow used from the login page's "Forgot password?"
  // link — just triggered here for a logged-in user who wants to change
  // their password proactively, not because they're locked out).
  const resetPassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin });
    if (error) { showToast('Could not send reset email: ' + error.message, 'error'); return; }
    showToast('Password reset link sent to your email', 'success');
  };

  // Actually, permanently deletes the account. This has to happen on the
  // server (see api/account-delete.ts) using Supabase's admin key — the
  // browser is never allowed to delete an auth.users row directly. Every
  // other table (profile, company_profiles, jobs, applications, messages,
  // friends, etc.) cascades from that one row, so a single successful call
  // here removes literally everything tied to this account in one shot —
  // for a company account, that includes its job postings, which is why
  // it disappears from students' "companies hiring" list immediately.
  //
  // The "are you sure" step lives below as the app's own styled popup (see
  // confirmDelete) instead of the browser's native `window.confirm()` —
  // that native dialog is rendered by the browser itself (stamped with the
  // site's raw URL), so it always looked out of place next to the rest of
  // the app's UI. This function just performs the deletion once that
  // in-app popup has already confirmed it.
  const deleteAccount = async () => {
    if (deleting) return; // already in flight — ignore extra clicks instead of firing duplicate requests
    setDeleting(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setDeleting(false); showToast('Not signed in', 'error'); return; }
    try {
      const res = await fetch('/api/account-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || 'Account deletion failed — please try again.', 'error');
        setDeleting(false);
        return;
      }
      showToast('Your account has been permanently deleted.', 'success');
      onSignOut();
    } catch {
      showToast('Account deletion failed — please try again.', 'error');
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------- Appearance (theme picker) ---------- */}
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

      {/* ---------- Custom wallpaper ---------- */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Wallpaper</h2>
        <p className="text-sm text-[var(--text-secondary)]">Upload a custom background image or GIF for your dashboard.</p>
        {wallpaper ? (
          // Already has one set — show a preview thumbnail + Change/Remove buttons.
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
          // No wallpaper yet — show a big dashed "click to upload" box.
          <button onClick={() => wallpaperInputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] p-8 transition-all hover:border-[var(--accent)]">
            <Image size={28} className="text-[var(--text-muted)]" />
            <span className="text-sm text-[var(--text-secondary)]">Upload wallpaper (image/GIF)</span>
          </button>
        )}
        {/* The actual file input is invisible (`hidden`) — every visible
            button above just calls `.click()` on this ref to open the
            OS file picker. */}
        <input ref={wallpaperInputRef} type="file" accept="image/*,image/gif" hidden onChange={handleWallpaper} />
      </div>

      {/* ---------- Account actions ---------- */}
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
        {/* The delete-account box is visually set apart (red-tinted
            border/background) since it's a destructive, higher-stakes action. */}
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trash2 size={16} className="text-rose-400" />
            <span className="text-sm font-medium text-rose-400">Delete Account</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-3">Permanently delete your account and all associated data. This cannot be undone.</p>
          <button onClick={() => setConfirmDelete(true)} className="btn-danger btn-sm">
            Delete Account
          </button>
        </div>
      </div>

      {/* ---------- Read-only account summary ---------- */}
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

      {/* The app's own delete-confirmation popup — replaces the browser's
          native window.confirm(), which rendered as an ugly OS-chrome
          dialog stamped with the site's raw URL instead of looking like
          part of the app (the same pattern MessagesView.tsx uses for
          confirming a message delete). */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => { if (!deleting) setConfirmDelete(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-5 shadow-xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Trash2 size={18} className="text-rose-400" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Delete your account?</p>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              This permanently deletes your profile, applications, jobs, messages, and friends. This cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="btn-ghost btn-sm">
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-60"
              >
                <X size={14} /> {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
