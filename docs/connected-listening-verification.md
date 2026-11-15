# Connected listening and Words progress verification

Date: 2026-11-15. OpenSpec: `replace-stories-with-connected-listening`.

## Scope and evidence boundaries

Stories is retired from primary navigation and home promotion. Words now contains
individual-word practice and Phrases & Messages. Short phrases bridge isolated
words and short messages through copying, after-listening detail recall, and
unscored listening reflection. Detail questions and choices remain absent until
playback finishes. Copying, detail recall, and self-report have separate progress;
recalling a detail also involves memory and language and is not a pure measure of
Morse perception.

The pure Rust engine supplies 256 original CC0 controlled variants, stable
content identities across tasks, strict repertoire filtering, deterministic native
and WASM generation, and honest availability/duration estimates. It does not
silently introduce unsupported sounds. Finite material and controlled variation
do not establish generalization or learning effectiveness; research and product
rationale are in the change's `research.md` and `docs/message-training.md`.

Words progress now has readable metrics, bounded charts, searchable and paginated
results, focused details, explicit errors/retry, and meaningful sparse/empty states.
Legacy exact-word accuracy is explicitly a final-copy metric. New message packets
retain full submitted first answers and repairs separately. Familiarity describes
available history, never a verified first-ever encounter. Failed remote history
reads cannot masquerade as an empty account; cached results remain visibly partial.

## Compatibility and storage

The additive `CWMSG001` packet uses existing owner-scoped transport, reset epochs,
and binary backups. Legacy story text, IDs, sentence order, bookmarks, deep links,
and packets are preserved; earlier stories remain in a compact archive. Old
listening is exposure rather than comprehension evidence. Core fixtures pin the
legacy story asset, legacy packet, and reserved assessment corpus hashes.

Guest activity remains local with contextual sign-in prompts. Signed-in activity
syncs through the existing account API. Pending accepted answers start persistence
before UI evaluation and survive pause, finish, navigation and failed upload.
Reset prevents delayed evaluation/encoding from restoring deleted activity;
sign-out retains the original owner's pending rows without guest leakage.

No dependencies, database migration, guided policy changes, milestone changes,
or audio-callback changes are introduced. The physical engineering and learning
effectiveness gate stays open.

## Software checks

- 131 Rust workspace tests, strict all-target Clippy and Rust formatting passed.
- Release WASM, TypeScript, frontend and API builds passed. All 29 standard
  API/WASM/query tests passed, including actual message packet sync, deduplication,
  owner isolation, full backup restore, browser merge, stale reset epochs, invalid
  packets, immutable legacy stories, first answers and repairs.
- Focused browser tests exercise actual worklet playback, question concealment,
  supported-input validation, unknown, replay/reveal assistance, unanswered
  exposures, task-independent familiarity, online history refresh, and delayed
  evaluation during pause/finish. Storage races hold both encoding and evaluation
  across a real Settings reset and failed upload/sign-out.
- Setup, ready, question, feedback and reflection fixtures at 320/1440 pixels
  were inspected in both themes. Populated/empty/sparse progress fixtures and
  selection, context filtering, pagination, graphs and recovery were also checked.
- Failed page-chunk download recovery passed Chromium, WebKit and mobile checks.
- The complete Chromium/WebKit/mobile regression passed 254 checks, with four
  intentional duplicate visual-fixture skips. Three additional page-download
  recovery checks passed across those engines.
- Firefox focus testing exposed a native content-process crash when the message
  history region used a cross-node `aria-labelledby` relationship. The heading
  target was unique and valid; changing the region to a direct accessible name
  preserves its landmark and avoids the crash. The isolation retained original
  graphs, history, scoring and conditions. No browser preference or test skip is
  used as a product workaround.
- All 20 progress checks passed across Chromium, Firefox, WebKit and mobile after
  that fix, including a named-landmark assertion, native Firefox keyboard focus
  and selection, real context switching, details, and both themes/viewports.
- The final Firefox practice/progress/storage/navigation release run passed
  17 checks, with one intentional duplicate visual-fixture skip and no failures.
  It includes page-download recovery, reset/sign-out races and navigation
  cancellation using default browser preferences.
- Strict OpenSpec validation passed. Software validation is not a physical
  key-to-pixel or sound-at-ear measurement.

## Combined workload

[Measured output](measurements/connected-listening-token-load-60s-2026-11-15.json)
records the existing 60-second software regression workload: live muted copying
and typing, concurrent Rust scoring/FULL SQLite commits, and separately timed
joined-token rendering using `web/scripts/measure-workload.ts` with
`DOJO_MEASURE_TOKENS=1`. It does not measure message-detail learning or physical
input/output latency.

| Observation | Value |
| --- | --- |
| Injected input events | 545 |
| Background evaluated/committed blocks | 120 |
| Timed 128-frame render calls | 22,800 |
| Input receipt to capture-handler p99 | 0.40 ms |
| Handler to next animation frame p99 | 17.5 ms |
| Instrumented WASM render p99 / maximum | 0.0100 / 1.766 ms |
| Server evaluation + SQLite commit p99 | 4.25 ms |
| Restored blocks / SQLite integrity | 121 / ok |
| Workload errors | 0 |

The existing 5/50 ms software input/display targets and render buffer budgets pass.
Physical audio/input timing, prolonged phone/device load and learning effectiveness
remain unverified. The physical engineering gate stays open.

## Release verification

- API release `0197a4aa5ca72678` is healthy on the existing phone service, with
  Google and GitHub ready. Archive SHA-256:
  `0197a4aa5ca72678b156239ab0187f268694e178ad11d79a82b778cff0e415fd`.
  The owner-only SQLite backup
  `backups/dojo-before-connected-listening-20261115T122541Z.sqlite` passed
  `integrity_check` before deployment.
- A read-only check in the actual phone Node/WASM runtime generated the three
  golden restricted-repertoire messages and round-tripped a correct `CWMSG001`
  packet. It did not write to the production database.
- Public `/health` and anonymous `/api/session` return 200, with both providers
  ready. Anonymous activity reads and account export remain 401.

- Frontend Cloudflare version `fccb748f-54b3-4db6-bdae-8a251092d311` is deployed at
  https://dojo.veryshyjelly.in. The existing static-only configuration has no new
  bindings or services. The main script remains below the existing 500 kB build
  warning threshold; connected practice loads as its own route chunk.
- Live Chromium and Firefox checks passed navigation, guest prompts, archive deep
  links, themes and 320/1440 layouts. Production assets with intercepted account
  requests completed actual WASM playback, an immutable submitted answer, and the
  new progress view. Firefox also focused the deployed conditions selector and
  verified the named activity region. No real learner data was changed.

Source milestones: `b5522bf` (engine/specification), `eb79c75` (website/progress),
and `c5745e3` (Firefox accessibility regression). Release evidence is recorded in
the following documentation commit.
