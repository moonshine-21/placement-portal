import { GraduationCap } from 'lucide-react';

export function AppSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--border)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex-shrink-0">
            <GraduationCap size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="h-4 w-28 rounded skeleton" />
            <div className="mt-1.5 h-2.5 w-20 rounded skeleton" />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-3">
            <div className="h-3 w-12 rounded skeleton" />
          </div>
          <div className="mt-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <div className="h-5 w-5 rounded skeleton" />
                <div className="h-4 flex-1 max-w-[140px] rounded skeleton" />
              </div>
            ))}
          </div>
        </nav>
        <div className="border-t border-[var(--border)] px-3 py-4 space-y-2">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="h-5 w-5 rounded skeleton" />
            <div className="h-4 w-20 rounded skeleton" />
          </div>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="h-5 w-5 rounded skeleton" />
            <div className="h-4 w-24 rounded skeleton" />
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col lg:ml-64 min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-base)]/70 backdrop-blur-xl px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <div className="h-6 w-40 rounded skeleton" />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="h-10 w-10 rounded-xl skeleton" />
            <div className="h-10 w-10 rounded-xl skeleton" />
            <div className="h-10 w-24 rounded-xl skeleton" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="space-y-4">
            <div className="h-32 rounded-xl skeleton" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-40 rounded-xl skeleton" />
              <div className="h-40 rounded-xl skeleton" />
              <div className="h-40 rounded-xl skeleton" />
            </div>
            <div className="h-24 rounded-xl skeleton" />
          </div>
        </main>
      </div>
    </div>
  );
}
