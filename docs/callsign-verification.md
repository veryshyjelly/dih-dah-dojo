# Callsign implementation verification

Date: 2026-11-15. OpenSpec change: `add-callsign-training`.

## Scope and architecture

Three implementation agents owned the Rust engine, progress/storage integration,
and dedicated website UI. The orchestrator integrated navigation, public references,
legacy tool repairs, optional signal environments and release verification.

The original synthetic corpus has deterministic versioned item IDs, international
and Indian shapes, digit-leading identifiers, long/special forms and portable slash
forms. Explicit part boundaries support diagnostics without a first-digit heuristic.
The new pure Rust module validates and scores whole-call initial/final submissions,
separate serial/zone exchanges and bounded alignment diagnostics. Callsign work
never mutates the guided learner/controller or establishes verified milestones.

New `CWCALL01` Postcard packets dispatch through existing language encode/decode.
Old word/story bytes remain unchanged. The account activity table, epoch guards,
export frame type 2, browser merge and account restore retain all activity kinds.
Each presentation has a stable trial ID; immutable submission revisions save
immediately and progress counts the presentation once. Original independent
evidence survives subsequent replay/reveal/repair. Explicit unknown is an initial
miss; assisted Reveal is excluded. Progress does not infer independence when the
initial revision is missing.

Setup, hidden whole-call rounds, recovery, CQ/DE target identification, serial/zone
fields, fixed/optional adaptive pace, targeted review and format/sound references
are integrated. Personal practice/progress requires sign-in. Words/Stories guest
policy is unchanged. Conditions and speed modes remain explicit comparison contexts.

Optional band-limited noise, gain-modulated fading and one bounded overlapping Morse
caller use prepared Web Audio graph nodes. The original sample-clock worklet remains
the target source. Secondary markers never enter target scoring. Completion, stop,
pause, navigation and faults clear all added layers and restore clean gain.
Preparation failures from both processor-error events and secondary port error
messages interrupt practice. Noise buffers are prepared on the main thread.

## Checks

- 113 Rust workspace tests passed; six new callsign tests exercise every supported
  family/mode/condition combination, stable regeneration, strict first/final scores,
  revisions, assistance, bounds and packet compatibility. Formatting and strict
  all-target Clippy passed.
- Release WASM and production TypeScript/frontend/server builds passed.
- All 12 API/WASM/query tests passed before final lifecycle follow-ups. They include
  owner/epoch/reset isolation, mixed word/callsign backup round trips and browser
  merges, revision deduplication, exact comparison context and eight-sample latency.
- The initial focused browser run passed 24 cases across Chromium, WebKit and iPhone
  emulation. The broad regression run passed 162 cases; three copies of an existing
  tool-description check failed because the revised text omitted the literal phrase
  `synthetic examples`. The description was corrected; the tests are retained.
- Both themes were rendered at 320 and 1440 pixels, including populated progress,
  graph inspection and first/repair feedback. Visual review fixed scoped dark heading
  contrast, stat-grid layout, mobile select targets and theme-transition flashes.
- Tests cover stable hidden material/replay, original versus repaired call/exchange,
  fixed/adaptive assistance boundaries, recovery/QSO/zone modes, unknown versus
  assisted reveal, reference/start races, reset-safe local writes, signal-layer
  cleanup/faults and legacy hidden-input/racing-listen bugs.

Final follow-up checks:

- The final broad run passed 169 cases. Five failures were in two new test fixtures:
  a prototype hook attached to a different Vite module instance, and an immediate
  IndexedDB read preceded the second asynchronous commit. The fixtures were changed
  to hold real HTTP uploads, inspect durable storage and use the real Settings reset.
  All six targeted cases then passed across Chromium, WebKit and mobile.
- Nine final integration checks passed, including pending legacy-drill navigation,
  hidden-input/material reuse and every signal layer's stop/fault cleanup. Three
  final overlap checks passed after clarifying that the lower-pitched caller is
  the target. Those checks exercise unchanged actual signal behavior.
- Expected-owner assertions on language reads, writes and imports reject an account
  switch before state access or packet validation. The optional assertion preserves
  older client compatibility; the new client supplies it on every request.
- Final production build, TypeScript, formatting, whitespace and strict OpenSpec
  validation passed. The static deployment dry run had no bindings.

These observations establish software behavior, not learning effectiveness, licensed
station assignments, physical delivered pace, or sound-at-ear/input timing. The
physical timing gate remains open.

## Production backup

Before backend installation, Python's consistent SQLite backup API created
`backups/dojo-before-callsigns-20261115T100604Z.sqlite` on the API host with mode 0600.
`PRAGMA integrity_check` returned `ok`. Production learner records are not used for
destructive import/restore testing.

Before the final guarded API release, a second consistent backup was made:
`backups/dojo-before-callsigns-final-20261115T102121Z.sqlite`; its integrity check
also returned `ok`.

## Deployment

- API release: `a82576ca715ff19e`, healthy on the existing isolated phone service.
  The actual phone Node/WASM runtime loaded the catalog and generated 30 items;
  all six exercise modes are available without touching the learner database.
- Frontend version: `df4801e5-e8f1-4110-9669-f8503e57101d`, live at
  `https://dojo.veryshyjelly.in/callsigns`.
- Public API health returned 200 with Google and GitHub ready. Anonymous language
  read/write and account export probes returned 401.
- Live public smoke passed for the library, sign-in/progress gates and 320/1440
  layouts. Production assets with a mocked account completed an actual Rust/WASM
  call round and displayed its progress. No real account data changed. Screenshots
  were saved as `/tmp/dojo-callsigns-production-{320,1440}.png` during this session.
