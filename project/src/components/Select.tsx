// ============================================================================
// src/components/Select.tsx
//
// WHAT THIS FILE IS: a custom-built dropdown menu component, used
// everywhere in the app instead of a plain HTML <select> tag.
//
// Drop-in replacement for a native <select className="input-field">.
// Native <select> popups are rendered by the OS/browser and can't be themed
// to match a dark UI (and they also trip the select:read-only cursor quirk
// fixed in index.css). This renders its own panel with app styling instead.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// Each option can either be shown with a different display label than its
// underlying value, or (more commonly) just be a plain string used as
// both — see `normalize()` below, which handles both forms.
type Option = { value: string; label: string };

// The props this component accepts, in the same style as a normal
// <select>: a current value, a callback for when it changes, and the
// list of choices.
type Props = {
  value: string;
  onChange: (value: string) => void;
  options: (string | Option)[]; // each entry can be a plain string OR a { value, label } pair
  placeholder?: string;         // shown when nothing is selected yet
  className?: string;           // lets the calling code add extra layout styling (e.g. width)
};

// Converts a plain string option into the full { value, label } shape, so
// the rest of this component only ever has to deal with one consistent
// format, regardless of which style the caller used.
function normalize(opt: string | Option): Option {
  return typeof opt === 'string' ? { value: opt, label: opt } : opt;
}

export function Select({ value, onChange, options, placeholder = 'Select…', className = '' }: Props) {
  const [open, setOpen] = useState(false); // is the dropdown panel currently showing?
  // A "ref" is React's way of getting a direct handle on an actual HTML
  // element on the page — here, so we can check "did the user click
  // somewhere OUTSIDE this component?" (see the effect below).
  const rootRef = useRef<HTMLDivElement>(null);
  const normalized = options.map(normalize);
  const selected = normalized.find((o) => o.value === value); // which option (if any) matches the current value

  // Sets up two "listen for this happening ANYWHERE on the page" event
  // handlers, but only while the dropdown is actually open — this is what
  // makes clicking outside the dropdown, or pressing Escape, close it.
  useEffect(() => {
    if (!open) return; // nothing to listen for when it's already closed

    // If the click happened somewhere that ISN'T inside this component
    // (`!rootRef.current.contains(e.target)`), close the dropdown.
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);

    // Cleanup: stop listening once the dropdown closes (or this component
    // disappears from the page) — otherwise these listeners would pile up
    // every time the dropdown is opened and closed repeatedly.
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]); // re-run this setup any time `open` changes

  return (
    // `relative` positioning here is what lets the dropdown panel below
    // be placed exactly under this box (using `absolute` positioning
    // relative to this wrapper) rather than floating somewhere random on
    // the page.
    <div ref={rootRef} className={`relative ${className}`}>
      {/* The visible box showing the currently selected value — clicking
          it toggles the dropdown open/closed. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field flex items-center justify-between text-left"
        // `aria-*` attributes here aren't visual — they help screen
        // readers (accessibility tools for visually impaired users)
        // understand "this is a dropdown, and here's whether it's
        // currently open."
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'text-[var(--text-muted)]'}>
          {selected ? selected.label : placeholder}
        </span>
        {/* The little down-arrow icon — `rotate-180` when open flips it
            upside down, as a visual cue. */}
        <ChevronDown size={16} className={`flex-shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Only render the dropdown panel's HTML at all when `open` is
          true — when closed, it doesn't exist in the page, not just
          hidden with CSS. */}
      {open && (
        <div
          role="listbox" // tells accessibility tools "this is a list of choices"
          className="dropdown-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-64 overflow-y-auto p-1 animate-slide-down"
        >
          {/* Draw one clickable row per option. */}
          {normalized.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value); // tell the parent component the new value
                setOpen(false);      // and close the dropdown
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-hover)]"
              // Highlight the currently-selected option's text in the
              // accent color, so it stands out from the rest of the list.
              style={{ color: opt.value === value ? 'var(--accent)' : 'var(--text-primary)' }}
            >
              {opt.label}
              {/* Show a little checkmark next to whichever option is
                  currently selected. */}
              {opt.value === value && <Check size={14} className="flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
