## Experience and Navigation

Use the existing Your progress shell, palette, outlined icons, stat cards, chart
cards and keyboard-driven inspection. Add Practice / Words / Stories tabs, with
`/progress`, `/progress?mode=words` and `/progress?mode=stories`; absent or invalid
mode selects Practice. Tab changes update browser history. Reload and Back/Forward
restore the chosen tab. Do not persist this presentation state in learner records.

Keep guided Practice's current view and guest sign-in invitation. Words and
Stories are available to guests using the guest store. Signed-in views use only
the current account. Put compact summaries on word setup and the story library:
Words shows independent answers, exact-word accuracy and distinct attempted words;
Stories shows stories completed and sentences heard. Each has a View progress
link to its tab. Suppress these summaries during playback, answering and feedback;
retain the existing round summary/player save status.

Remove the Your word and story data and Recent activity disclosures from both
practice pages. Present readable history and drilldowns in progress instead.
Move browser activity export and guest clearing into a reusable Settings data
section; retain account export/reset and local export of pending browser records.
Clearing guest activity still requires literal DELETE. Signing in never imports
guest history implicitly.

## Data and Queries

Add typed presentation-only models and pure query functions over LanguageStore
Entry records and catalog metadata. Keep source records immutable. Deduplicate by
owner/activity ID before aggregation; use the Rust-derived `outcome.eligible` and
scores rather than reimplementing eligibility or scoring in JavaScript.

Extend the existing WASM `language_catalog(c, e)` JSON response with word metadata
`words: [{ id, text, meaning, set }]`, retaining its existing version/stories fields.
Read labels from the catalog rather than parsing IDs. This is an additive response
field, not a new persisted schema or backend API. Factor shared catalog/entry
types for use by practice, progress and Settings.

Create/reuse an owner-scoped store subscription or controller to publish new
entry snapshots and save/sync status. Refresh on page entry, completed saves,
online synchronization, account changes and successful reset. Cancel/ignore stale
loads from former owners or epochs. Derive queries with memoization keyed by entry
revision, catalog, mode and filters; never prepare charts in the audio callback.
Preserve existing server accepted-order bookmark behavior. Chart dates use the
recorded timestamp, grouped in the browser's local calendar/timezone; break equal
timestamps by activity ID. These dates are observed record dates, not verified
server timestamps.

Loading, offline/pending sync, unavailable storage and no history are distinct
states. Unreadable/unknown-version packets remain exportable and are excluded
from computed metrics. Unknown labels use an unavailable-content label, not an
invented word/title. Never reveal future story sentences through progress details;
show expected text only for submitted or explicitly disclosed records.

## Words Metrics and Filters

An independent answer is an eligible word entry. The default context is the
latest eligible word entry's input method, requested character/effective WPM,
vocabulary set, and word-length band (2–3, 4–5, 6+). Offer observed contexts only,
and latest 30 / 100 / All eligible answers; default 30. Do not default to a future
automatic speed. With no eligible entries, show empty accuracy charts while
retaining all activity in the readable history. Historical selected repertoires
are unavailable, so these groups describe recorded conditions, not verified
comparable proficiency evidence.

All three summary values use the selected context/range: answer count, exact
correct answers divided by eligible answers, and distinct attempted word IDs.
Zero denominators display an empty value, never 0% accuracy.

Provide three expandable graph cards:

1. Requested character/effective pace: one point per eligible answer in the
   selected input/vocabulary/length group, across observed speeds, limited by the
   chosen range. Label these requested settings, not delivered speed or improvement.
2. Exact-word accuracy: group the selected eligible answers by local calendar day;
   each point is correct/count, with numerator and denominator available in detail.
3. Character accuracy: arithmetic mean of non-null Rust attempt/final scores per
   local day, with a separate valid sample count for each series. Label these
   averages across answers, not a pooled character score.

Apply context/range selection before daily grouping; disclose that boundary days
can contain only the selected answers. Render only actual populated days, without
interpolation over missing days, smoothing or projected trends.

The searchable word table and activity history show all saved word activity for
the owner, clearly separate from the filtered charts. Each word row shows eligible
answer count, exact correct count/rate, assisted activity count and last recorded
practice. Assistance is replay or disclosure; repeated material, self-report and
interruptions have their own labels. Opening a row shows dates, recorded answers,
expected word where disclosure is permitted, requested speeds, input and outcome.
Use human labels, not raw IDs, as the primary text.

## Stories Metrics and Filters

All-time overview cards show stories started (a known story with any saved entry),
stories completed, and distinct sentences heard. A heard sentence has at least one
finished, uninterrupted record and a valid catalog sentence index. Count each
story-version/sentence once across repeated records. A completed story has every
catalog sentence heard. Replays and revealed listening may contribute to exposure,
but never turn listening completion into independent accuracy evidence.

Show each story's all-time coverage bar, saved position and last activity. Continue
listening navigates to `/stories?story=<stable-id>` and selects the story only after
activity/bookmarks load. Preserve the stopped-bookmark behavior and require Play;
navigation must not start audio automatically. Unknown IDs return to the library
with a clear unavailable-story message.

The coverage graph plots cumulative unique sentences heard by local day, for all
stories or a selected story (default all). The 30 / 100 / All range refers to latest
completed, uninterrupted listening events, default 30. Compute coverage from full
history first, then limit the displayed event window and group by day; show the
earlier baseline so a shortened range does not imply lost progress. Deduplication
prevents replay events from raising the line. Label coverage as listening exposure.

The transcription card uses eligible typed story entries, grouped by story,
requested character/effective speed and input method. Default to the latest
eligible context. Offer latest 30 / 100 / All eligible transcriptions (default 30),
independent of the coverage range, with explicitly labeled controls. Plot daily
arithmetic mean attempt/final accuracy, excluding null scores with visible sample
counts. If no eligible transcriptions exist, show a quiet empty state; listening
alone must not create an accuracy value. History retains all event categories.

## Presentation Boundaries and Verification

Reuse or extract shared graph cards/inspection from the current progress page;
support bounded percentage scales and date/sample-count details without changing
guided graphs. All graph points must be keyboard selectable with accessible text
equivalents. A single point remains inspectable; empty data has no fabricated line.
Do not add latency, measured listening duration, sessions/round counts, mastery,
reliability labels, learning trends or verified milestones to language progress.

Cover pure queries with seeded record fixtures, browser flows with guest/account
fixtures, and light/dark layouts at 320, 780 and 1440px. Run Rust/WASM checks for
the additive catalog change, frontend build, formatting, browser regressions,
whitespace and strict OpenSpec validation. Rebuild WASM before production build.
Deploy frontend/WASM together, anonymously smoke-test public routes, then commit
and push evidence. No production learner records are mutated for verification.
Rollback uses the previous static deployment; existing history remains compatible.
