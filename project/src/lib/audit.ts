// ============================================================================
// src/lib/audit.ts
//
// WHAT THIS FILE IS: a single helper function that every admin-only action
// in the app calls, so there's a permanent paper trail of "who did what."
// Think of it like a security camera log for the admin panel — if a user
// gets banned, or a forum post gets deleted, this is what writes down
// "admin X did this, to this thing, at this time" into the database.
// ============================================================================

import { supabase } from './supabase';

// `logAdminAction` takes one object full of details about what just
// happened, and saves it as one row in the `admin_audit_log` table.
//
// The `params: { ... }` part describes exactly what information the
// caller must (or may) provide:
//   actorId, actorName  — REQUIRED: who performed the action
//   action               — REQUIRED: a short code name for what happened, e.g. "ban_user"
//   targetType           — REQUIRED: what kind of thing was affected, e.g. "profile"
//   targetId?            — OPTIONAL (the "?" means it can be left out): the specific ID of the thing affected
//   targetLabel?         — OPTIONAL: a human-readable name for that thing, for display in the audit log screen
//   details?             — OPTIONAL: any extra freeform info worth recording
export async function logAdminAction(params: {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
}) {
  // Save one new row into the admin_audit_log table. `.insert(...)` is
  // Supabase's way of saying "add this new row."
  const { error } = await supabase.from('admin_audit_log').insert({
    actor_id: params.actorId,
    actor_name: params.actorName,
    action: params.action,
    target_type: params.targetType,
    // `params.targetId || ''` means: "use targetId if it was given,
    // otherwise fall back to an empty piece of text" — this is needed
    // because the optional fields above might be `undefined`, and the
    // database column doesn't accept `undefined`, only text.
    target_id: params.targetId || '',
    target_label: params.targetLabel || '',
    details: params.details || {},
  });

  // If saving the audit log entry itself failed for some reason, we don't
  // want to crash the admin's whole action over it (the ban/delete/etc.
  // already succeeded) — we just quietly log it to the browser console so
  // a developer could notice and investigate later.
  if (error) console.error('Failed to write audit log:', error);
}
