// ============================================================================
// src/components/ConfirmDialog.tsx
//
// WHAT THIS FILE IS: the app's own confirmation popup, used in place of the
// browser's native window.confirm() everywhere the app needs a "are you
// sure?" step before a destructive action (removing a friend, deleting a
// post/announcement/event/project, etc). The native confirm() renders as
// plain OS chrome stamped with the site's raw URL, which looks completely
// out of place — this instead matches the rest of the app (same glass
// panel + backdrop-blur look used for every other modal), rendered via a
// portal straight onto <body> so it always sits above everything else.
//
// Usage: keep a `confirmTarget` (or similar) piece of state in the calling
// view for "what am I about to delete, if anything", pass `open={!!confirmTarget}`,
// and do the actual delete inside `onConfirm`.
// ============================================================================

import { createPortal } from 'react-dom';
import { Trash2, AlertTriangle } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // `danger` (the default) styles this as a destructive/red action
  // (delete, remove); set to false for a neutral confirmation.
  danger?: boolean;
  // Disables both buttons and swaps the confirm label for a "…ing" state
  // while the actual delete request is in flight.
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  busyLabel = 'Working…',
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-5 shadow-xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {danger ? <Trash2 size={18} className="text-rose-400" /> : <AlertTriangle size={18} className="text-[var(--accent)]" />}
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        </div>
        {description && <p className="mt-2 text-xs text-[var(--text-muted)]">{description}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost btn-sm">
            {cancelLabel}
          </button>
          {danger ? (
            <button
              onClick={onConfirm}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-60"
            >
              <Trash2 size={14} /> {busy ? busyLabel : confirmLabel}
            </button>
          ) : (
            <button onClick={onConfirm} disabled={busy} className="btn-primary btn-sm">
              {busy ? busyLabel : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
