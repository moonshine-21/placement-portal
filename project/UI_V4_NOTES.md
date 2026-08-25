# Placement Portal V4 UI

This build keeps the flicker-free shell and adds back the visual features requested:

- Real frosted-glass workspace using ONE isolated `backdrop-filter` surface.
- Header visually touches the sidebar on desktop.
- Header has theme, notifications, and the user's profile avatar on the right.
- Avatar opens a profile popover with banner, avatar, name, email, branch, bio, skills, and Edit Profile.
- Edit Profile routes to the existing student/company profile editor.
- Animated constellation particle background is restored with low GPU load, 30fps cap, DPR cap, visibility pause, and reduced-motion support.
- Sidebar remains blur-free to preserve the flicker fix.
- Header no longer has a second backdrop-filter; it inherits the single workspace glass layer behind it.
- Main content scrolls independently inside the fixed app viewport.

## Important compositor rule

Do not add `backdrop-filter` to the sidebar, animated canvas, individual navigation rows, or every card. If more blur is needed later, extend the single `.app-main-glass` layer or use blur only for short-lived popovers/modals.

## Validation

Run locally after extracting:

```bash
npm install
npm run typecheck
npm run build
```

Dependency installation could not be completed in the build environment because the network install timed out, so the ZIP is not claiming a successful production build from this environment.
