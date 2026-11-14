# Unified language progress

Your progress now has Practice, Words and Stories tabs with URL/history state.
Word and story setup shows compact summaries and progress links. Settings owns
browser exports and DELETE-confirmed guest clearing. Existing account data controls
and guided training retain their evidence boundaries.

Read-only presentation queries use existing Rust outcomes and additive catalog
metadata. Independent word accuracy is exact correct/eligible answers; character
accuracy is a mean across non-null answer scores with sample counts. Contexts use
observed input, requested speeds, vocabulary and length band. Selected repertoire
was not recorded historically, so these are activity statistics, not proficiency
estimates. Requested pace is not measured delivered speed.

Story coverage counts each valid finished uninterrupted sentence once; replay
cannot increase coverage. The shortened timeline retains a full-history baseline.
Listening coverage and independent transcription accuracy have separate controls.
Continuation waits for the existing bookmark and never starts audio automatically.
Progress detail does not disclose unsubmitted/unrevealed story sentences.

Catalog metadata is an additive WASM response field. Activity binary formats and
backend endpoints are unchanged. Unreadable versions remain available in browser
export. Guest/account ownership and reset epochs use existing persistence rules.
Async views ignore obsolete load results; store saves and clear operations notify
mounted progress/Settings views. Bookmarks retain accepted store order; chart dates
use recorded timestamps grouped in the browser's local calendar.

Browser verification uses synthetic keyboard input and software audio completion.
Real mobile hardware, acoustic latency, physical timing, and learning effectiveness
remain unverified. The physical timing gate remains open.

Verification passed: production TypeScript/Vite/API build, Rust tests, Rustfmt,
strict Clippy, WASM release build, seven API/engine tests, five pure query tests,
formatting/whitespace, strict OpenSpec validation, deployment dry run and staged
Gitleaks scan. Browser evidence includes the full regression run and focused
reruns: all word/story and progress checks passed across Chromium, WebKit desktop
and iPhone emulation; Settings navigation was corrected for guests. The final
focused run passed 33 checks plus three unsupported-record export checks. Guided
practice, appearance, help and audio-navigation checks passed in the broader run.

Screenshots were reviewed for compact Stories and wide Words in dark mode; browser
fixtures also render both themes at 320, 780 and 1440px. Test evidence is software
evidence, not physical timing verification.

Deployed frontend/WASM version: `6ba07375-8982-46ad-a335-44ada54cb1ae`.
Anonymous production smoke passed for progress tabs, story continuation without
autoplay, setup summary links, Settings guest-clear cancellation and compact
layout, with no page errors. Production screenshots are
`/tmp/dojo-language-progress-words-live.png` and
`/tmp/dojo-language-progress-stories-live.png`. No production learner records
were changed, and no backend release was required.
