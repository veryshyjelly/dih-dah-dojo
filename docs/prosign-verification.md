# Prosign implementation verification

Date: 2026-11-15. OpenSpec: `add-prosign-training`.

## Scope

An agent team implemented the Rust/WASM engine, practice/reference experience,
and comparable progress/storage integration. The orchestrator integrated routes,
audio dispatch, sound-library links, help, regression tests and release checks.

The public library covers BT, AR, SK, AS, HH, the joined KN amateur convention,
VE and CT, with primary-source links and joined-versus-spaced playback. Recognition,
meaning recall and original operating situations have separate evidence contexts.
AR/+ and BT/= share accepted answers; no exercise invents an acoustic distinction.
Personal rounds and progress require sign-in. Existing Words/Stories guest policy
is unchanged. Prosign results never update guided targets or verified milestones.

The new opt-in token compiler preserves ordinary character schedules and packets.
Preparation expands joined patterns before playback; the render callback is unchanged.
Only token playback trims the final silent word gap, enabling a response after
the final tone. Core tests cover one-dot internal timing under Farnsworth spacing,
waveform aliases, malformed/bounded inputs and native/WASM deterministic targets.

New CWPROS01 packets use the existing owner-scoped activity transport and backup
frames. Each immutable revision retains the initial response; progress counts
presentations once. Accepted writes start before UI evaluation so pause, finish
and navigation cannot discard a submission. Paused evaluations reconcile the
same trial's revision; finished summaries accept results from their own round.
Reset generations and account owners still guard local writes and synchronization.

## Software checks

- 122 Rust workspace tests passed, including nine prosign tests; strict all-target
  Clippy and Rust formatting passed.
- Release WASM, TypeScript, frontend and API builds passed. All 17 API/WASM/query
  tests passed, including actual prosign sync/dedup, owner isolation, backup restore,
  browser merge, reset epochs, first/repair evidence and latency sample limits.
- Focused practice checks passed across Chromium, WebKit and iPhone emulation:
  complete-token submission, alias repair, meaning/replay, contextual disclosure,
  unknown, delayed evaluation during Escape/F5, and prompt response at 20/5 WPM.
- Public navigation, sign-in gating, real worklet token playback, populated progress,
  graph point inspection and stable review routes passed browser integration checks.
- The full Chromium/WebKit/mobile regression passed 208 checks, with two intentional
  duplicate-visual-fixture skips. Six additional storage race checks passed across
  those engines. Firefox passed all ten applicable new practice/integration checks
  (one duplicate visual fixture skipped). Eight final alias/pending-evaluation
  follow-up checks passed across all four engines.
- Storage races explicitly hold both encoding and evaluation over a real Settings
  DELETE reset and assert zero late rows/uploads. A failed pending upload retained
  the correct owner's durable records through navigation and sign-out, with no guest
  leakage. Displayed first answers retain the user's exact alias, such as +.
- Light/dark setup, active practice, feedback and populated progress fixtures at
  320/1440 pixels were inspected; progress also passed 1024-pixel overflow checks.
  A native browser review was attempted, but concurrent user activity prevented
  safely completing that session. Automated keyboard/browser checks provide the
  UI interaction evidence for this release.

## Combined workload

[Measured output](measurements/prosign-token-load-60s-2026-11-15.json) records a
60-second disposable Chromium workload with live muted copying audio and typing,
concurrent Rust scoring/FULL SQLite commits, and separately instrumented joined
prosign rendering. Run with `DOJO_MEASURE_TOKENS=1` using the existing
`web/scripts/measure-workload.ts` harness. This is software evidence, not a physical
key-to-pixel or sound-at-ear measurement.

| Observation | Value |
| --- | --- |
| Injected input events | 567 |
| Background evaluated/committed blocks | 121 |
| Timed 128-frame joined-token render calls | 22,990 |
| Input receipt to capture-handler p99 | 0.20 ms |
| Handler to next animation frame p99 | 17.0 ms |
| Instrumented WASM render p99 / maximum | 0.0077 / 0.623 ms |
| Server evaluation + SQLite commit p99 | 3.80 ms |
| Restored blocks / SQLite integrity | 122 / ok |
| Workload errors | 0 |

The existing 5/50 ms software input/display targets and render buffer budgets pass.
The ordinary-text version also passed before the token-mode run. Physical output
timing, headphone/device behavior, actual key-switch latency, prolonged phone load
and learning effectiveness remain unverified. The physical engineering gate is open.

## Release verification

- API release `2cd9946ac03291a2` is healthy on the existing phone service. The
  owner-only SQLite backup `backups/dojo-before-prosigns-20261115T111050Z.sqlite`
  passed `integrity_check` before deployment. Archive SHA-256:
  `2cd9946ac03291a2b6e948285c88555315dc7f721356298263479cbd711eb1a0`.
- The actual phone Node/WASM runtime returned eight signals, three modes and 30
  deterministically generated items; a prosign packet round trip scored correctly.
  This read-only smoke did not write to the production database.
- Public `/health` and anonymous `/api/session` return 200 with Google/GitHub ready.
  Anonymous activity reads/writes and account export return 401. An initial check
  used the nonexistent `/api/health` path and a bot user agent; verification was
  corrected to the actual `/health` endpoint with a browser user agent.
- Frontend Cloudflare version `a3c94e2e-885d-447a-a2bc-6e785eb16bea` is deployed at
  https://dojo.veryshyjelly.in. The existing static-only configuration has no new
  bindings or services.
- Live public library, atomic worklet preview, sign-in/progress gates and 320/1440
  layouts passed. Production assets with intercepted mock-account requests completed
  an actual-WASM alias answer and progress view. No real learner data was changed.

Source milestones: `dbbb40c` (engine/specification) and `9f3fcff`
(website/progress/storage tests). Release evidence and the reproducible token-mode
workload option are recorded in the following documentation commit.
