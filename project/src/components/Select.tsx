import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: (string | Option)[];
  placeholder?: string;
  className?: string;
};

function normalize(opt: string | Option): Option {
  return typeof opt === 'string' ? { value: opt, label: opt } : opt;
}

// Drop-in replacement for a native <select className="input-field">.
// Native <select> popups are rendered by the OS/browser and can't be themed
// to match a dark UI (and they also trip the select:read-only cursor quirk
// fixed in index.css). This renders its own panel with app styling instead.
export function Select({ value, onChange, options, placeholder = 'Select…', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalized = options.map(normalize);
  const selected = normalized.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'text-[var(--text-muted)]'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`flex-shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="dropdown-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-64 overflow-y-auto p-1 animate-slide-down"
        >
          {normalized.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: opt.value === value ? 'var(--accent)' : 'var(--text-primary)' }}
            >
              {opt.label}
              {opt.value === value && <Check size={14} className="flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
