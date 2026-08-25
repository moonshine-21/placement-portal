# Flicker root-cause audit — 2026-08-25

The previous UI had several independent compositor/render triggers, so fixing only the active sidebar pill did not solve the problem.

## Confirmed code-level causes

1. **A continuously animated full-window background** used `requestAnimationFrame` and a canvas.
2. **Structural glass/compositor effects** were mixed into the shell in previous revisions (`backdrop-filter`, `will-change: backdrop-filter`, and a blurred active navigation surface).
3. **The active navigation state was implemented as a separate moving element**, so changing views caused a transform/compositing update in the sidebar.
4. **Page-entry animations were still attached to many view elements**, so switching views could visually flash/repaint large portions of the content.
5. The application shell was repeatedly patched instead of being treated as one fixed viewport with one primary scroll container.
6. Previous comments claimed some blur/compositor paths had been removed even though CSS still contained them. This made later debugging misleading.

## Stability strategy in this build

- No `backdrop-filter` anywhere in the application CSS.
- No `will-change: backdrop-filter`.
- No moving active-nav pill.
- Active state is painted directly on the actual nav button.
- No requestAnimationFrame particle loop.
- Ambient background gradients are static.
- Page-entry animations are disabled for navigation stability.
- `html`, `body`, `#root`, and the application shell use a fixed viewport and `overflow: hidden`.
- Only the main content region scrolls.
- Sidebar navigation has its own scroll region.
- The visual language remains glass-like through translucent/gradient surfaces, borders, highlights and shadows rather than live blur.

This deliberately favors deterministic rendering over expensive compositor effects. The result should be visually close to the requested Discord-inspired glass workspace while eliminating the classes of effects most likely to cause the observed flicker.
