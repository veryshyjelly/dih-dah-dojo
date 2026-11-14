## Technical Approach

Extend the existing Route union, pathname resolver and route rendering in
`web/src/App.tsx` with words and stories. Use the existing navigation/history
mechanism; direct visits, reloads and popstate must select the same destination.
Do not add a router dependency. Retain `/tools` for the remaining utilities;
previous word/story selection was component state, so it has no old dedicated URL
to redirect.

Render `LanguagePractice` in a standalone page/panel, keyed by kind and account,
with the same engine, snapshot, input profile and owner inputs. Use Words and
Stories as compact navigation labels and Word training and Story listening as
accessible page names. Retain the existing BookOpen/Headphones badges, titles,
pace controls, word chips, story cards, save indicators and history disclosures.
Avoid a second oversized heading above the existing component heading. Constrain
the panel to 1120px and center it within the existing page shell; use fluid width
and existing mobile padding below that size.

Remove the two items and embedded LanguagePractice branch from Tools; initialize
its selection to text. Update Home callbacks/cards to navigate directly to the
three practice destinations. Keep the hero's guided-training action and Explore
the tools link unchanged.

Reuse the header's active styling and add an accessible current-page indication.
Keep desktop navigation on one row. At widths of 1100px or less, put navigation
in a separate row below brand/actions, with horizontal scrolling, no wrapping,
at least 44px-high targets and visible keyboard focus. Reserve its height in the
layout, prevent document-level horizontal overflow, and scroll the active item
into view without moving the page vertically or adding animation.

## Lifecycle and Compatibility

Route changes, including Back/Forward, must stop playback and run component
cleanup. Invalidate pending playback completions and remove listeners when the
mode/account changes; late completions must not advance or save an abandoned
activity. Let the audio service accept an optional request-validity predicate
(defaulting to valid for existing callers), checked after initialization and
after stopping prior audio, before preparing a transmission. Preserve existing interruption and save semantics rather than adding
new completion records during navigation. Retain bookmark-load gating, pending
save handling, guest-local history, account isolation and signed-in sync.

Do not change character defaults, content, training policy, correctness feedback,
binary formats or guided milestones as part of this navigation change. The new
routes use the existing static SPA deployment; no API deployment is required.

## Verification and Rollout

Update navigation-dependent browser fixtures and add direct-route/history and
playback-teardown coverage. Render both themes at 320, 780 and 1440px. Run the
browser regression suite, production build, formatting/whitespace checks and
strict OpenSpec validation. Record evidence and remaining hardware limitations,
deploy the frontend, anonymously smoke-test both production routes, and publish
the source. Do not mutate production learner history for verification. Rollback
uses the previous static frontend deployment; stored records remain compatible.
