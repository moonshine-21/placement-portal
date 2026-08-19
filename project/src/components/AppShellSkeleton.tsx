// ============================================================================
// src/components/AppShellSkeleton.tsx
//
// WHAT THIS FILE IS: a placeholder version of AppShell.tsx, shown ONLY
// while the app is still figuring out who's logged in / what feature
// flags are set (see the `loading` gate in App.tsx). It deliberately uses
// the EXACT SAME layout dimensions as the real AppShell — same sidebar
// width (w-64), same header height, same fixed positioning — just filled
// with gray placeholder bars instead of real nav labels/icons.
//
// WHY THIS EXISTS: previously, "loading" showed a completely different,
// unrelated screen (a small centered spinner icon, no sidebar at all).
// The instant loading finished, React swapped that out for the ENTIRE
// real AppShell in one synchronous paint — sidebar, header, and content
// all appearing at once, in a single frame, with literally nothing in
// between. That "nothing, then everything, in one frame" is what reads
// as a blink/flash, no matter how fast or slow the underlying data
// actually loads.
//
// By shaping this placeholder exactly like the real sidebar, there's
// never a moment where "no sidebar" swaps to "sidebar" — the sidebar
// shape is already on screen from the very first frame; only its
// CONTENTS change (gray bars → real nav items), which is a much smaller,
// far less jarring visual change than the whole region appearing from
// nothing.
// ============================================================================

export function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar placeholder — same fixed width/position as the real one */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--border)]">
          <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-[var(--surface-hover)] animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-24 rounded bg-[var(--surface-hover)] animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-[var(--surface-hover)] animate-pulse" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden px-3 py-4">
          <div className="h-2.5 w-10 rounded bg-[var(--surface-hover)] animate-pulse" />
          <div className="mt-3 space-y-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <div className="h-[18px] w-[18px] flex-shrink-0 rounded bg-[var(--surface-hover)] animate-pulse" />
                <div
                  className="h-3 rounded bg-[var(--surface-hover)] animate-pulse"
                  style={{ width: `${60 + ((i * 17) % 40)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-3 py-4 space-y-1.5">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="h-[18px] w-[18px] rounded bg-[var(--surface-hover)] animate-pulse" />
            <div className="h-3 w-16 rounded bg-[var(--surface-hover)] animate-pulse" />
          </div>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="h-[18px] w-[18px] rounded bg-[var(--surface-hover)] animate-pulse" />
            <div className="h-3 w-14 rounded bg-[var(--surface-hover)] animate-pulse" />
          </div>
        </div>
      </aside>

      {/* Main area placeholder — same left margin/header height as real one */}
      <div className="flex flex-1 flex-col lg:ml-64 min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-base)]/70 backdrop-blur-xl px-4 py-3.5 md:px-6">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-[var(--surface-hover)] animate-pulse" />
            <div className="hidden h-3 w-56 rounded bg-[var(--surface-hover)] animate-pulse md:block" />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--surface-hover)] animate-pulse" />
            <div className="h-10 w-10 rounded-xl bg-[var(--surface-hover)] animate-pulse" />
            <div className="h-10 w-28 rounded-xl bg-[var(--surface-hover)] animate-pulse" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-[var(--surface-hover)] animate-pulse" />
            ))}
          </div>
          <div className="mt-4 h-64 rounded-2xl bg-[var(--surface-hover)] animate-pulse" />
        </main>
      </div>
    </div>
  );
}
