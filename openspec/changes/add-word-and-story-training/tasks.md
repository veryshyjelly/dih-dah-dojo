## 1. Shared content and evidence foundation

- [x] 1.1 Add versioned, licensed catalogs: at least 100 everyday words, 20 radio abbreviations with meanings, and six short stories with explicit sentence IDs; exclude assessment material.
- [x] 1.2 Implement pure seeded Rust word filtering/selection and catalog validation; derive repertoire and scheduled duration using the current timing engine.
- [x] 1.3 Define typed activity/bookmark models and versioned web binary envelopes without changing native records or guided policy.
- [x] 1.4 Implement Rust word outcome calculation, sentence-scoring reuse, assistance/review/interruption labels, and isolated activity queries.
- [x] 1.5 Add owner-scoped local persistence/outbox and authenticated API storage with server validation, deduplication, revisions, and reset epochs; support guest unsynced activity.
- [x] 1.6 Extend export/reset/account deletion/backup/restore and backward compatibility for the new activity records and bookmarks.

## 2. Word training

- [x] 2.1 Add Words to Tools with repertoire, vocabulary, length, timing, and response-mode controls and honest empty/small-pool states.
- [x] 2.2 Implement ten-word rounds, typing/submission, replay/reveal, explicit skip, stable manual feedback, keyboard/touch controls, and optional self-report.
- [x] 2.3 Add missed-word review and separate first-attempt, assistance, and review summaries; verify no guided state changes.
- [x] 2.4 Integrate cancellation, dialog priority, pause/interruption handling, and shared audio ownership with existing tools and practice.

## 3. Story listening

- [x] 3.1 Add Stories library cards with required characters, content length, and timing-derived duration.
- [x] 3.2 Implement sentence playback, previous/next, replay, explicit reveal, accumulated disclosed transcript, and continuous listening.
- [x] 3.3 Implement optional sentence transcription with existing attempt/final scoring and assistance labels.
- [x] 3.4 Add version-aware resume bookmarks, completion tracking, owner-safe synchronization, and reload without autoplay.

## 4. Verification and release

- [x] 4.1 Test content/repertoire validity, seeded selection, empty pools, reserved assessment exclusion, score denominators, and immutable guided evidence.
- [x] 4.2 Test binary compatibility, owner isolation, retries, stale revisions/reset races, offline recovery, unavailable storage, and export/restore.
- [x] 4.3 Add browser coverage for both themes, desktop/mobile, stable feedback, answer concealment, keyboard/touch/dialog routing, audio interruptions, replay/navigation races, continuous mode, and bookmarks.
- [x] 4.4 Run Rust tests, formatting, strict Clippy, web/API tests/build/format checks, and strict OpenSpec validation.
- [x] 4.5 Validate native browser keyboard/touch flows and combined audio/input/render/scoring/storage load against existing latency targets; record limitations and leave the physical timing gate open.
- [x] 4.6 Update help, privacy/data documentation, and verification evidence; deploy compatible API support before frontend writers, release words then stories, and verify live save/resume/reset flows.
