# Callsign training

## Experience
Callsigns is a first-class destination with a clear account invitation for signed-out
visitors, an inviting setup page consistent with Practice, and a distinct Callsigns
progress category. Reference cards can be explored without creating practice
evidence. Account sign-in is required to start/save callsign rounds and inspect
personal callsign progress. Existing Words/Stories guest policy is unchanged.

A round prepares a bounded stable list. Play, replay, reveal, check and review refer
to the same item; regeneration is explicit. Default fixed-speed clean practice is
self-paced. The full expected call, its structure and reference hints stay hidden
until disclosure. Learners can type/backspace, submit with Enter, request replay,
choose unknown/reveal, pause with F5, replay with F6 and finish with Esc. Repeated
keys cannot submit twice. Finishing/help/navigation/visibility loss stop or pause
audio and cannot save a delayed completion as independent evidence. Response input
is immediately visible; correction feedback remains readable until Next.
Explicit unknown submits an independent miss, while a separate assisted reveal
does not enter the independent denominator. Post-disclosure repairs carry visible
assistance without changing the previously saved independent first submission.

Families progress from short calls through international variety, long/special-event
shapes and portable/operating-abroad slash forms. They include Indian examples and
digit-leading national identifiers; structural parts come from generation metadata,
never a split at the first digit. These are original synthetic examples and do not
assert actual assignment, a license entitlement or a universal country/DXCC mapping.
The library explains structure after disclosure and links back to whole-call audio.

Recovery repeats the same call while preserving the original independent attempt.
CQ/DE exercises distinguish the calling station from the learner's station. Serial
and zone exercises have separately labeled exchanges and independently score call
and exchange fields. Noise, fading and a bounded overlapping caller are optional
advanced conditions with separate progress contexts. This is a practice simulator,
not a full contest logger or a claim of physically verified radio realism.

## Engine and integration contract
Add a pure `dojo_core::callsigns` module. Expose `callsign_catalog()`,
`callsign_generate(config_json)` and `callsign_evaluate(activity_json)` through WASM.
Generation returns stable versioned item IDs, target text, audio text, family, mode,
condition, structured parts and optional exchange metadata. Config uses `seed`,
`count` (1–30), `family` (`short`, `international`, `long`, `portable`, `mixed`),
`mode` (`call`, `recovery`, `qso`, `contest-serial`, `contest-zone`, `pileup`) and
`condition` (`clean`, `noise`, `fading`, `pileup`). Both sides communicate the final
exact generated types before integration; do not silently infer unknown values.

Calls use a new `CWCALL01`-prefixed versioned Postcard packet. Their activity JSON
shares existing language activity fields (version/id/item/sentence/kind/input/c/e,
answer/attempts/replay/revealed/review/interrupted/finished/self_report/created),
with `kind="callsign"`, optional bounded `latency_ms` and `speed_mode` fixed/adaptive.
Every presented call has a stable `trial_id`. Submitted initial/repair revisions
are immediately appended with immutable IDs `${trial_id}-${revision}` (0–31), so
reload cannot lose an accepted first submission. Progress groups revisions by
trial ID, retaining initial independent evidence and the latest repaired outcome
without double counting or erasing the original miss.
The item ID deterministically identifies corpus version and generating conditions;
expected content is regenerated and validated in Rust. No persisted JSON is used.
Existing language_encode/decode dispatch callsign packets while preserving old
word/story serialization. The existing owner-scoped language table, paginated API,
epoch guards, import batch and backup frame type 2 therefore cover all three kinds.
Unknown packets stay exportable. Wrong/oversized/unsupported packets are rejected.

Outcome retains `eligible`, `correct`, `attempt_accuracy`, `final_accuracy` and adds
whole-call first/final exactness, expected/parts diagnostics and exchange correctness
as appropriate. Initial submitted text is primary independent evidence; edits,
replays, reveals and later repair cannot turn an initial miss into first-pass success.
Keyboard and touch, assisted/review/interrupted, clean and impaired results remain
separate. Fixed/adaptive provenance, corpus version, family/mode, c/e and condition
are part of comparison context. Latency is typing-inclusive, nonnegative and only
summarized with at least eight correct independent samples. No extrapolated trends.

Adaptive pace is optional and confined to callsigns: complete independent success
may raise effective pace within configured bounds; failure may lower it. Assisted
results do not promote pace. Character speed stays at least effective speed.
Guided controller targets, learner state and verified milestones are never updated.

## Team ownership
- Engine agent: new Rust callsigns module, WASM entry points/packet dispatch, core
  tests; repair legacy generator validation with original synthetic material.
- Progress agent: frontend activity typing, callsign pure queries/progress component,
  account sync/backup regression tests and compatibility review.
- Experience agent: CallsignPractice component and its scoped stylesheet, setup,
  rounds, recovery/context exercises and reference cards; coordinate engine types.
- Orchestrator: OpenSpec, app navigation/auth/progress wiring, legacy tool state,
  optional audio environments, integration/browser tests, builds and deployment.

## Validation and release
Test deterministic generation/format metadata, exact/partial/tail-edit scoring,
assistance, adaptive boundaries, legacy packet compatibility, owner/epoch/reset
isolation, import/export round trips, progress comparison/latency evidence, keyboard
and touch, stable replay, answer hiding, cancellation/visibility and audio cleanup.
Render setup/round/reference/progress in both themes at compact/wide sizes. Run
Rust tests/fmt/strict Clippy, production WASM/web/server builds, API/browser tests,
formatting and strict OpenSpec validation. Back up SQLite before backend deployment;
smoke production without mutating real learner records. Keep physical gate open.
