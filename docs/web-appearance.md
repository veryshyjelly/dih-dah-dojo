# Web appearance and public source

The header has a light/dark toggle. A first visit follows the device preference;
a manual choice is remembered under `dojo-theme` in browser localStorage. Device
changes continue to apply until a manual override. Browser tabs share changes;
blocked storage falls back to an in-memory choice without breaking the studio.

`web/public/theme.js` is a small same-origin head script that resolves the theme
before React renders. It updates `data-theme`, native `color-scheme`, and the
browser's theme color. It complies with the existing CSP without inline scripts.
`ThemeToggle.tsx` subscribes through React's external-store hook, independently
of the training component. Toggling does not pause audio, restart a block, change
response deadlines, or write to account/learner state.

The original light colors remain CSS fallbacks. Dark semantic colors live in
`theme.css`, including surfaces, illustrations, inputs, assistance/fault states,
dialogs and chart points. No filter-based inversion or new dependencies are used.

The footer links to https://github.com/veryshyjelly/dih-dah-dojo in a separate tab.
The public repository identifies https://dojo.veryshyjelly.in as its homepage.
Native and browser sources, lockfiles, build scripts and deployment documentation
are included; private runtime credentials, data and generated artifacts are excluded.

## Verification

- Production TypeScript/Vite build and formatting checks pass.
- All 42 Chromium, WebKit desktop and mobile-emulation checks pass. New cases
  verify initial system/saved preference, persistence after reload/navigation,
  device preference changes, unavailable storage, recognition continuity,
  readable sampled contrast, and both themes at 320px/1440px across public pages
  and dialogs. Screenshots were visually inspected.
- The existing six API/WASM tests pass. Native audio/policy code is unchanged.
- Gitleaks 8.30.1, downloaded from its official release with a verified SHA-256,
  reviewed the full source history before publication. Two exact historical prose
  fingerprints about key-switch timing are documented in `.gitleaksignore`;
  they contain no credentials. The reviewed history scan reports no leaks.
- A tracked-file audit found no credentials, learner databases, or generated
  dependency/deployment/runtime artifacts.
- The OpenSpec appearance change validates. Physical timing remains unverified.

## Publication evidence — 2026-11-14

The repository is PUBLIC with `main` published and its homepage set to the live
studio. An anonymous browser clicked the deployed footer link and successfully
opened the public GitHub README. The live site followed a dark device preference,
retained a manual choice after reload, and reported no browser errors. All 18
appearance checks passed again after the final focus/selection polish.

Cloudflare static deployment version: `e1c16e8d-73d5-4ac1-b7cf-5ab424b07b3d`.
The deployment remains assets-only, with no new server functions or paid bindings.
The documented WASM build helper is executable in fresh clones.

## Compact help guide

Help now uses a short, named dialog with shortcut rows, small practice cards, and
expandable progress/timing/data explanations. Its header and footer remain visible
while only the body scrolls, including at 320×568 and 1200×480. Both themes were
visually reviewed. Opening help pauses active practice or holds a saved-summary
countdown. Escape closes only the guide, and closing it leaves practice/countdown
paused for an explicit resume. Dialog keys do not become practice responses.

All 54 Chromium, WebKit desktop and mobile-emulation regressions passed, including
short-window scrolling, fixed controls, recognition resumption, and unchanged saved
evidence while reading help. TypeScript/build, formatting and OpenSpec checks pass.
