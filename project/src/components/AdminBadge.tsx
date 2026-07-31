import { ShieldCheck, Crown } from 'lucide-react';

export function AdminBadge({ role = 'admin' }: { role?: string }) {
  const isOwner = role === 'owner';
  return (
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
