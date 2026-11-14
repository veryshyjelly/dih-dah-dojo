## 1. Data and presentation queries

- [x] 1.1 Add backward-compatible word metadata to the WASM catalog response and shared frontend types; verify existing callers and rebuild generated WASM assets.
- [x] 1.2 Implement pure word queries for observed contexts, eligible ranges, exact accuracy, mean character scores, pace points, searchable word summaries and readable history.
- [x] 1.3 Implement pure story queries for unique sentence coverage, completion, range baselines, per-story summaries and eligible transcription contexts/accuracy.
- [x] 1.4 Add owner-scoped entry revision/subscription handling and cached progress models; refresh after saves/sync/reset and ignore stale owner/epoch results.

## 2. Progress experience

- [x] 2.1 Add Practice / Words / Stories tabs with query-string routes, reload/history behavior, guest-local language views and the existing guided Practice view.
- [x] 2.2 Build Words stat cards, three inspectable graphs, context/range controls, searchable word table and recorded-answer details.
- [x] 2.3 Build Stories overview cards, per-story coverage/Continue listening, coverage timeline and optional transcription accuracy/details.
- [x] 2.4 Implement bookmark-aware `/stories?story=<id>` entry without autoplay and with an unavailable-story fallback.
- [x] 2.5 Replace practice-page data/history disclosures with compact setup summaries and View progress links; hide them during active play/feedback.
- [x] 2.6 Move browser export and DELETE-confirmed guest clearing to Settings while preserving account export/reset and pending local exports.
- [x] 2.7 Add consistent icons, empty/loading/sync states, accessible point inspection and responsive light/dark styling.

## 3. Verification

- [x] 3.1 Test eligibility, zero/null denominators, exact-word versus character accuracy, selected-context/range ordering, daily boundaries and sample counts.
- [x] 3.2 Test duplicate/replayed sentence coverage, partial/full stories, shortened-range baselines, invalid sentence indices, transcription filtering and listening-only empty accuracy.
- [x] 3.3 Test historical records, unknown versions, guest/account isolation, pending sync, stale loads, reset epochs and DELETE cancellation/export flows.
- [x] 3.4 Test direct progress links, Back/Forward, summary links, saved-position continuation, no autoplay and no unrevealed story text in details.
- [x] 3.5 Verify keyboard graph/table details and both themes at 320, 780 and 1440px; run affected browser regressions and guided-practice regressions.
- [x] 3.6 Run Rust/WASM tests/checks, production frontend build, formatting, whitespace and strict OpenSpec validation; record evidence and keep the physical timing gate open.

## 4. Release

- [x] 4.1 Deploy frontend/WASM together and anonymously smoke-test language progress, Settings and story continuation routes in production.
- [x] 4.2 Commit and push the verified source, completed tasks and verification evidence.
