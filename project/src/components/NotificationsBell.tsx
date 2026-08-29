// ============================================================================
// src/components/NotificationsBell.tsx
//
// WHAT THIS FILE IS: the little bell icon (with a red unread-count badge)
// shown in the app's top bar — clicking it opens a dropdown list of the
// user's notifications (new messages, application status changes, friend
// requests, etc). Updates live via Supabase's realtime feature, so a new
// notification's badge count appears instantly without needing a refresh.
// ============================================================================

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Notification } from '@/lib/supabase';
import { Bell, X } from 'lucide-react';

// A small local copy of the same "3h ago" style formatter also found in
// src/lib/data.ts — kept as its own copy here rather than imported, since
// it's such a tiny, self-contained piece of logic.
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// A lookup table mapping each notification "type" (see the Notification
// type in supabase.ts) to a small emoji icon shown next to it.
const ICON_MAP: Record<string, string> = {
  application: '📥',
  message: '💬',
  status: '🔔',
  friend_request: '👤',
  friend_accepted: '🎉',
};

type Props = {
  onNavigate: (view: string) => void;      // called when a notification is clicked, to jump to the relevant page
  open: boolean;                            // is the dropdown currently showing? (controlled by the PARENT component — see AppShell.tsx)
  onOpenChange: (open: boolean) => void;    // how this component asks its parent to open/close it
};

export function NotificationsBell({ onNavigate, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetches the 30 most recent notifications for the current user.
  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications((data as Notification[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
    if (!user) return;

    // Subscribe to LIVE changes on this user's notifications — both brand
    // new ones arriving (INSERT) and existing ones changing (UPDATE, e.g.
    // being marked read from another device). Either kind of change just
    // triggers a full reload of the list, which is simple and reliable
    // even though it's not the most bandwidth-efficient approach possible.
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => loadNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => loadNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // How many notifications are currently unread — shown as the little
  // red badge number on the bell icon.
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Marks every notification as read at once (called automatically when
  // the dropdown is opened, see the button's onClick below).
  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    loadNotifications();
  };

  // Permanently deletes every notification for this user.
  const clearAll = async () => {
    if (!user) return;
    // Clear the list on screen immediately (before the server even
    // confirms it), so the UI feels instant — this is called an
    // "optimistic update." If it turns out the delete actually failed, we
    // reload the real list from the server to correct the display.
    setNotifications([]);
    const { error } = await supabase.from('notifications').delete().eq('user_id', user.id);
    if (error) {
      showToast('Could not clear notifications', 'error');
      loadNotifications(); // undo the optimistic clear by reloading the real (unchanged) list
    } else {
      showToast('Notifications cleared', 'success');
    }
  };

  // Runs when a single notification row is clicked: mark it read (if it
  // wasn't already), jump to whatever page it points at, close the
  // dropdown, and refresh the list.
  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    }
    if (n.link_view) onNavigate(n.link_view);
    onOpenChange(false);
    loadNotifications();
  };

  // Closes the dropdown if the user clicks ANYWHERE else on the page
  // while it's open — same "click outside to dismiss" pattern used in
  // Select.tsx, just implemented slightly differently here (listening
  // globally, and relying on `e.stopPropagation()` below to stop clicks
  // INSIDE this component from triggering the close).
  useEffect(() => {
    const close = () => onOpenChange(false);
    if (open) {
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [open, onOpenChange]);

  return (
    // `onClick={(e) => e.stopPropagation()}` on the OUTER wrapper stops
    // any click inside this whole component (the bell button, or the
    // dropdown panel) from bubbling up and triggering the "close on
    // outside click" listener set up above.
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          onOpenChange(!open);
          // The moment the dropdown is opened (not closed), mark
          // everything as read — like most notification systems, "seeing"
          // the list counts as acknowledging it.
          if (!open && unreadCount > 0) markAllRead();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--accent)]/10 active:translate-y-0 active:scale-95"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {/* The little red count badge, only shown when there's at least
            one unread notification. Shows "9+" instead of a big exact
            number once it passes 9, to keep the badge visually small. */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-1 text-[10px] font-bold text-white animate-fade-in-scale">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="dropdown-panel absolute right-0 top-12 z-50 w-80 max-h-[420px] flex flex-col animate-slide-down overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="font-semibold text-[var(--text-primary)]">Notifications</span>
            <button
              onClick={clearAll}
              className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin">
            {loading ? (
              // Skeleton placeholders while the first load is in progress.
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14" />)}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <Bell size={28} className="text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-muted)]">No notifications yet</p>
              </div>
            ) : (
              // The actual list of notifications, newest first (already
              // sorted that way by the database query above).
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className="flex w-full items-start gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">{ICON_MAP[n.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{n.title}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{n.body}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {/* A small dot indicating "still unread" — vanishes
                      once read (which, as noted above, happens the moment
                      the dropdown is opened). */}
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-[var(--accent)] flex-shrink-0 mt-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
