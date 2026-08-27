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
//
// WHY THE PANEL IS PORTALED TO document.body: the panel used to be a plain
// `absolute` child, positioned relative to this component's own wrapper.
// That looked fine in isolation, but any `.card` element (used all over
// the app) sets `backdrop-filter`, which — like `transform` or
// `perspective` — silently creates its own CSS stacking context. Once a
// Select lives inside a `.card`, its dropdown's `z-50` is only compared
// against OTHER elements inside that same card's stacking context; it can
// never win against a completely different sibling element later in the
// DOM (e.g. another `.card` below it, like a list of posts), no matter how
// high its z-index looks on paper — the browser paints that later sibling
// on top regardless. That's exactly what caused the forum's category
// dropdown to render visually BEHIND the post list under it, with clicks
// landing on whatever was actually on top instead of the dropdown options
// (showing a "blocked" cursor over what looked like a menu item).
//
// Portaling the panel to `document.body` sidesteps all of that: it becomes
// a sibling of literally everything else on the page, so its own z-index
// is guaranteed to win against any other element, regardless of which
// component tree — or how many `backdrop-filter` cards — it's nested
// inside. Position is computed from the trigger button's own bounding box
// (including its width, so the panel lines up exactly under it) and
// re-measured on scroll/resize while open, the same approach already used
// for the header's profile popover (see AnchoredPortal.tsx).
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // element on the page — here, the trigger button, so we can both check
  // "did the user click somewhere OUTSIDE this component?" and measure
  // where the portaled panel should be positioned.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const normalized = options.map(normalize);
  const selected = normalized.find((o) => o.value === value); // which option (if any) matches the current value

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
  };

  // Measure synchronously before paint so the panel never flashes at (0,0)
  // or the wrong spot for a single frame.
  useLayoutEffect(() => {
    if (open) measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sets up "listen for this happening ANYWHERE on the page" event
  // handlers, but only while the dropdown is actually open — this is what
  // makes clicking outside the dropdown, or pressing Escape, close it, and
  // what keeps the portaled panel glued to its trigger while scrolling.
  useEffect(() => {
    if (!open) return; // nothing to listen for when it's already closed

    const onReposition = () => measure();
    // The click could land on the portaled panel (which now lives outside
    // this component's own DOM subtree in document.body) or the trigger
    // button itself — neither of those should count as "outside."
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // capture:true on scroll so this fires even for scroll containers
    // other than window (e.g. a scrollable modal body).
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]); // re-run this setup any time `open` changes

  return (
    <div className={`relative ${className}`}>
      {/* The visible box showing the currently selected value — clicking
          it toggles the dropdown open/closed. */}
      <button
        ref={triggerRef}
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

      {/* Only render the dropdown panel's HTML at all when `open` is true
          AND we have a measured position — when closed, it doesn't exist
          in the page, not just hidden with CSS. Portaled to document.body
          (see the big comment at the top of this file for why). */}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="listbox" // tells accessibility tools "this is a list of choices"
          className="dropdown-panel fixed z-50 max-h-64 overflow-y-auto p-1 animate-slide-down"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
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
        </div>,
        document.body
      )}
    </div>
  );
}
