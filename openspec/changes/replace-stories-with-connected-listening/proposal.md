## Why
The standalone story shelf emphasizes completing a small catalog without checking
message understanding. Words progress also retains an older layout with tiny
labels, unbounded lists, oversized story charts and a catalog-load race that can
show valid saved activity as zero. Learners need a purposeful bridge from isolated
words to short connected messages, with clear and honest progress.

## What Changes
- Retire Stories from primary navigation and home promotion while preserving old
  story records, text definitions, bookmarks, deep links, exports and imports.
- Add Phrases & Messages within Words: short connected copying, after-listening
  message-detail recall, and explicitly self-reported listening.
- Use original reviewed material with controlled variation, stable identities,
  repertoire filtering, pace/duration estimates and separate familiarity contexts.
- Redesign Words progress and add distinct connected-listening progress; compact
  legacy story activity into an archive rather than a new completion dashboard.
- Fix shared light-mode progress-tab contrast and explicit loading/error states.
- Preserve guided training policy, assessment isolation and real-time architecture.

## Impact
New pure Rust/WASM content/scoring/codec module, React practice/progress/navigation,
and the existing account-scoped activity transport. New versioned binary packets
are additive. There are no new dependencies or external generation services.
This is a product hypothesis informed by research, not a verified learning outcome.
The physical timing and learning-effectiveness gate remains open.
