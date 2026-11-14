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
