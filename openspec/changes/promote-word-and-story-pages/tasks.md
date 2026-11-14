## 1. Navigation and pages

- [x] 1.1 Add `/words` and `/stories` to route parsing/rendering and main navigation, including accessible page names/current-page state and direct-load/history behavior.
- [x] 1.2 Render standalone LanguagePractice pages keyed by mode/account, preserving existing presentation and save/bookmark behavior.
- [x] 1.3 Remove Words/Stories from Tools and default its remaining selection to Your own words.
- [x] 1.4 Replace studio feature cards with Practice, Word training and Story listening while retaining the hero and Explore the tools actions.
- [x] 1.5 Add the responsive navigation row and standalone page sizing; ensure active links remain visible and keyboard reachable.

## 2. Regression verification

- [x] 2.1 Update existing Tools-based word/story tests and add direct visits, reloads, active state, studio links, Back/Forward and remaining Tools-default checks.
- [x] 2.2 Verify navigation during word/story/guided playback stops audio, cleans listeners and prevents stale advancement; cover pending completion races.
- [x] 2.3 Verify guest access/local history, signed-in sync/account isolation, saved story bookmarks and bookmark-load gating through the new routes.
- [x] 2.4 Verify light/dark layouts and keyboard navigation at 320, 780 and 1440px, including active-item visibility and absence of document overflow.
- [x] 2.5 Run the browser regression suite, production build, formatting/whitespace checks and strict OpenSpec validation; record evidence without closing the physical timing gate.

## 3. Release

- [x] 3.1 Deploy the frontend and anonymously smoke-test `/words`, `/stories`, studio entry points and the Tools default in production.
- [x] 3.2 Commit and push the verified source and implementation evidence.
