# Words and Stories navigation

Words (`/words`) and Stories (`/stories`) are standalone main-navigation
experiences, with direct entry and studio feature cards. Tools now starts with
Your own words and retains the remaining utilities. Existing language activity,
account boundaries and guided-training policy are preserved.

Navigation invalidates language playback callbacks before stopping audio, including
browser Back/Forward. Component cleanup removes the navigation listener. This
prevents an interrupted outgoing continuous story from advancing or writing a
stale result. Audio preparation also checks that the request is still current
after initialization and before transmission, so leaving during initialization
cannot start delayed audio. Already submitted saves retain the existing persistence semantics.

The header uses a scrollable navigation row at widths up to 1100px, with current
page semantics, keyboard focus and 44px targets. Active items are revealed on route
changes and resize without scrolling the document. Standalone panels use the
existing icon badges and theme palette and are capped at 1120px.

Validation covers direct routes/reloads, browser history, studio cards, Tools
selection, real audio cancellation, bookmark restoration, guest reset cancellation,
account-isolated storage and both themes at 320, 780 and 1440px. Browser screenshots
and synthetic keyboard input are software evidence; real mobile hardware and
physical audio/input timing remain unverified. The physical timing gate stays open.

Verification passed:

- 48 final browser checks across Chromium, WebKit desktop and iPhone emulation
  for appearance, language practice and navigation, including delayed initialization.
- 36 studio/help regression checks passed in the broader browser run.
- Production TypeScript/Vite/API build, Prettier, whitespace checks, strict OpenSpec
  validation, deployment dry run and staged Gitleaks scan passed.
- OpenSpec reports the documented archive-order prerequisite: sync the predecessor
  `polish-tool-library` before applying this change's modified Tools-default requirement.

Frontend deployed as `bfeb3db6-794f-429a-a909-5d407e4b9e58`.
Anonymous production smoke passed for both direct routes, 26 word-letter chips,
six story cards, studio entry cards, the Tools default and the 320px layout, with
no browser errors. Screenshots: `/tmp/dojo-words-promoted-live.png` and
`/tmp/dojo-stories-promoted-live-compact.png`. No production learner records were
changed. The backend release was not changed.
