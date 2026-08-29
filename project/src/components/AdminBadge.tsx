// ============================================================================
// src/components/AdminBadge.tsx
//
// WHAT THIS FILE IS: a tiny, reusable little pill/tag showing "Admin" or
// "Owner" next to a person's name, used wherever an admin or owner's name
// appears in the app (their profile, forum posts, the admin panel, etc).
// ============================================================================

import { ShieldCheck, Crown } from 'lucide-react'; // icon library used throughout this project

// `{ role = 'admin' }` means: this component takes one optional prop
// called `role` — if the caller doesn't pass one in, it defaults to
// 'admin'. Usage elsewhere looks like: `<AdminBadge role={profile.role} />`
export function AdminBadge({ role = 'admin' }: { role?: string }) {
  const isOwner = role === 'owner';
  return (
    // One small pill-shaped tag. The color and icon change depending on
    // whether this is an "Owner" (gold/amber, crown icon — the single
    // highest permission level) or a regular "Admin" (red, shield icon).
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isOwner ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'
      }`}
    >
      {isOwner ? <Crown size={10} /> : <ShieldCheck size={10} />}
      {isOwner ? 'Owner' : 'Admin'}
    </span>
  );
}
