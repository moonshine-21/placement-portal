import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ToastType = 'info' | 'success' | 'error';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl backdrop-blur-xl border min-w-[280px] max-w-sm
              ${t.type === 'success' ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100'
              : t.type === 'error' ? 'bg-rose-500/15 border-rose-400/30 text-rose-100'
              : 'bg-sky-500/15 border-sky-400/30 text-sky-100'}`}
          >
            <span className={`h-2 w-2 rounded-full flex-shrink-0
              ${t.type === 'success' ? 'bg-emerald-400'
              : t.type === 'error' ? 'bg-rose-400'
              : 'bg-sky-400'}`} />
            <span className="text-sm font-medium leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
