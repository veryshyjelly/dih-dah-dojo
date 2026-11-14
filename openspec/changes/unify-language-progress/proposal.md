## Why

Words and Stories currently expose activity as data-management disclosures and
raw history rows on their practice pages. Learners need the same approachable
progress experience as guided Practice: meaningful summaries, charts and details
in Your progress.

## What Changes

- Add Practice, Words and Stories tabs to Your progress, with direct URLs and
  browser-history support.
- Replace the practice-page data/history disclosures with compact progress
  summaries and View progress links, shown during setup rather than active play.
- Add word accuracy, requested pace, character accuracy and per-word details.
- Add story completion, saved positions, listening coverage, optional
  transcription accuracy and Continue listening actions.
- Move browser activity export and guest DELETE-confirmed clearing to Settings.
- Support guest-local progress and account-isolated signed-in progress using
  existing saved records and Rust-derived outcomes.

## Impact

Frontend presentation, read-only progress queries, additive WASM catalog metadata,
and verification. No backend endpoint, activity binary layout or storage migration
is required. Existing activity contributes immediately; no historical timings,
round boundaries or selected repertoires are invented.

This follows `add-word-and-story-training` and `promote-word-and-story-pages`.
Language results remain separate from guided character estimates, automatic
targets and verified milestones. The physical timing gate remains open.
