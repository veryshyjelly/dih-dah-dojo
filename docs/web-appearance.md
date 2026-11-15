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

Help-guide deployment: `05ad48f3-fc78-4b78-9075-9def681db4e4`. A live anonymous
browser verified the compact guide in dark mode at wide and 320×568 sizes,
expanded and scrolled its details, kept the close/footer controls in view, and
closed it through both Escape and Got it without browser errors.

## Monaspace audit and family research — 2026-11-15

The website currently loads **Neon only**, under the generic CSS family alias
`Monaspace`. Its 510,832-byte WOFF2 matches the official v1.400 release by SHA-256.
The face is variable, not a single static weight: CSS declares 200–800, with body
weight 400 and other weights used for hierarchy. Width and slant are not used.
Inspection of the official equivalent WOFF reports `wght` 200–800, `wdth` 100–125,
and `slnt` −11–0. The WOFF2 container's `version 1.0` reported by `file` is not
the typeface's release version.

[GitHub Next's overview](https://monaspace.githubnext.com/) distinguishes five
metric-compatible families. The following allocation is a design recommendation,
not a typography rollout already applied to the website:

| Family | Character | Recommended Dojo role |
| --- | --- | --- |
| Neon | Neutral, neo-grotesque sans | Body text, navigation, forms, and literal practice responses |
| Argon | Humanist sans | Main headings and welcoming practice-page titles |
| Krypton | Mechanical sans | WPM/tone instruments, compact metadata, and progress labels |
| Xenon | Slab serif | Occasional reading or editorial accents, rather than another global heading style |
| Radon | Handwriting | Brief coaching accents; avoid transcripts, callsigns, answers, numbers and dense help |

Start with a Neon/Argon/Krypton core. Keep expressive accents scarce and tied to
meaning. Metric compatibility permits family mixing at matching axes; it is not
evidence that every family has equal readability at every size. Check 0/O, 1/I/l,
all 42 response symbols, prosign brackets and slash-bearing callsigns at actual
compact-screen sizes before assigning a new face to practice data.

The [official README](https://github.com/githubnext/monaspace/blob/v1.400/README.md)
separates texture healing (`calt`) from coding ligatures (`ss01`–`ss10`, with
additional `liga` spacing behavior). Healing redistributes glyph drawings within
the existing character grid. It can suit prose; coding ligatures should remain
off for literal responses and dot/dash patterns. A joined `<AR>` presentation
must not depend on a font ligature to express its audio semantics. Frozen builds
bake in features for environments without feature controls; normal web builds
are preferable here because CSS provides those controls. Nerd Font builds add
icon glyphs the app does not need; its existing SVG icon system should remain.

For implementation, give each family its own `@font-face` name and semantic
tokens such as `--font-body`, `--font-heading` and `--font-instrument`. Declare
the supported weight/width ranges. Prefer `font-weight` and `font-stretch` over
hard-coded low-level axis settings; low-level `font-variation-settings` can
override high-level choices. This follows the
[MDN variable-font guide](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Fonts/Variable_fonts).
Do not treat the width axis as a condensed option: its minimum is 100.

The official five variable WOFF2 files total 2,876,612 bytes before HTTP transfer
effects: Neon 510,832; Argon 540,384; Xenon 583,680; Krypton 445,408; Radon 796,308.
Preload only the critical face and load other roles on demand; compare the actual
static cuts needed against variable payloads before shipping. Use versioned or
content-hashed asset URLs with the existing immutable font caching. Retain the
OFL notice; any custom subsetting must also respect its reserved-name conditions.
Do not use full-font archives, CDN calls or new font dependencies in the product
merely to demonstrate the families.

A separate five-family comparison uses pinned v1.400 fonts and supports editable
sample text and a texture-healing toggle. All five faces loaded, both controls
worked, and its 320/736-pixel layouts were checked. It is a research preview,
not an additional website route or a change to practice rendering.

## Words setup and console investigation — 2026-11-15

Individual-word setup was unnecessarily calling `language_catalog`, which
compiles archived-story sentences to estimate their durations. At 20/1 WPM,
that unrelated request reaches the existing 180-second playback guard and can
display a story error on Words. Only story mode now requests that catalog;
stale request rejections also respect effect cleanup. The playback guard remains.
All 36 language-practice checks passed across Chromium, Firefox, WebKit and mobile,
including slow Words setup after navigation and existing archived-story behavior.

The production CSP contains no inline-script allowance. Live HTML contains only
same-origin external script tags, and source/public/built files contain no
`file:///` links. Clean Chromium and Firefox sessions visited the studio,
Prosigns, Words and connected practice with zero CSP violations or console errors.
The user confirmed the warning disappears in a private window with extensions
disabled. This points to the normal browser profile or an extension; the exact
injector was not identified. No CSP weakening, guessed hash, or static nonce was
added. Cloudflare's optional script injection is another documented CSP source,
but was not observed in these responses; see its
[JavaScript Detections documentation](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/).
