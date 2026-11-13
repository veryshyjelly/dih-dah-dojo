# Integrated trainer verification

Recorded 2026-11-14 on the local Apple silicon Mac, macOS 27.2 (26B123).
Pinned dependencies and cw-policy-v1.2 are recorded in Cargo.lock and OpenSpec.

## Native audio stress

A release build ran `diagnose --seconds 1800 --silent --stress` against the local
CoreAudio output, with concurrent exact scoring and immediate redb transactions.
Output was muted by application gain; this did not exercise acoustic detection.
The measured callback size was 128 frames at 48 kHz. The report is:

```text
elapsed_seconds=1800.090545708
callbacks=674998
actual_buffer_min=128
actual_buffer_max=128
render_p99_ms=0.002666
max_render_budget_percent=1.294
callback_deadline_misses=0
clock_mapping_residual_p99_ms=0.006251
clock_calibrated=true
fault=false
backend_fault_code=0
clock_or_worker_error=None
physical_loopback_performed=false
```

The render budget target (<25% p99, <100% maximum) and mapping residual target
(<=2 ms p99) passed for this run. This is neither a recording of output nor proof
of zero audible glitches. The stress run exercised the persistent transport before
terminal integration; it did not run thirty minutes of simultaneous UI typing.

## Interactive sessions

Native terminal/audio smoke checks used isolated directories under `/tmp`:

- Recognition: explicit unknown, answer disclosure, partial stop, save, exit, restart
  and offline replay. Completed independent trials remained in history.
- Copying: typed `AX`, Backspace, `B`; paused for over a minute; resumed, typed more,
  and stopped. The displayed final copy retained `AB`; the paused block was excluded
  from proficiency. Binary restart and policy/score replay passed.
- A complete no-input copying run applied exactly two boundary catch-up gaps,
  ended audio, accepted the bounded tail, saved a completed assisted block, and
  reduced E from 5 to 4. Further audio required explicit Enter. Restart/replay
  reproduced the saved target and controller state.
- A muted native three-minute check used an isolated synthetic readiness profile
  (not human proficiency evidence). It completed a 180,000,000,000 ns assessment
  window, scheduling 253 characters and their gaps in 179.76 s. No rescue occurred;
  the ten-second response tail was bounded. Zero responses produced 0% accuracy and
  no milestone. The offered date persisted, another same-day offer was suppressed,
  and all five records replayed successfully. Skipping readiness left the initial
  calibration flag false; no physical timing claim is inferred.
- Terminal raw mode, bracketed paste mode, cursor, and alternate screen were restored
  after normal exit and Ctrl-C.
- One copying run during concurrent compilation reported a CoreAudio Xrun (code 2).
  It was stopped, recorded as technically compromised, and replayed without
  converting the fault into learner failures. The clean stress result does not
  override this observation or certify every machine-load condition.
- A sandboxed audio-open failure left previously committed repertoire information
  intact and displayed an actionable error; it did not record incorrect answers.

## Automated software checks

`cargo test --locked`, strict Clippy, and rustfmt pass. The suite includes 89 tests:
62 library, 4 history CLI, 2 callback-allocation, 4 scorer CLI, two scoring
references, fourteen integrated policy/session traces, and a streamed-backup
allocation check.

The exhaustive reference checks 1,922 short timed/untimed string pairs. Session
traces use frozen clocks and recorded material to verify delayed recognition,
substitutions, skip/rejoin, correction-heavy copying, stable lag, overload, no input,
bounded difficulty, policy-state replay, tamper rejection, and binary restart.
These traces verify software behavior, not human learning effectiveness.

## Physical verification still outstanding

Physical output loopback, key-switch timing, wired/Bluetooth route comparisons,
and physical input/display latency distributions remain unmeasured. Software
receipt and terminal-draw distributions are reported below. Estimated
onset/response latency remains provisional. Callback frame timing is sample-accurate in software; physical delivery
and stop/pause-to-silence tolerances require the protocol in
[engineering-design.md](../openspec/changes/define-adaptive-cw-training/engineering-design.md).

Practice on an unverified route is permitted by that design. Task 1.2 remains open;
this implementation does not certify it or claim improved learning effectiveness.

## Live-analysis measurements

Run `cargo run --release --locked --example measure_analysis` for the reproducible
40-sample worker benchmark. On this Mac, before/after optimization p99 values were:

| Case (target/response symbols) | Before | After |
| --- | ---: | ---: |
| Short copy (400/400) | 2.221 ms | 0.885 ms |
| Long check (1300/1300) | 12.903 ms | 4.953 ms |
| Long check with skipped suffix (1300/1200) | 10.915 ms | 2.874 ms |
| Near-limit extra input (1300/3000) | 25.981 ms | 15.083 ms |

Live analysis now reuses its cost matrix for agreement, avoiding a second alignment
and unnecessary edit-count range calculations. The exact final scorer retains its
full statistics. Exhaustive prefix-frontier comparisons and 100 longer timed
attribution comparisons pass. These are isolated worker measurements, not a universal
latency guarantee. Work exceeding 100 ms compromises the block; bounded workspace
failure retains a technical record without partial proficiency credit.

## Final release smoke

A five-second muted scoring/storage stress repeat on the integrated release build
reported:

```text
elapsed_seconds=5.042071208
callbacks=1870
actual_buffer_min=128
actual_buffer_max=128
render_p99_ms=0.001667
max_render_budget_percent=0.161
callback_deadline_misses=0
clock_mapping_residual_p99_ms=0.005125
clock_calibrated=true
fault=false
backend_fault_code=0
clock_or_worker_error=None
physical_loopback_performed=false
```

The build also passed `cargo build --release --locked --offline`. The earlier
30-minute result and this short repeat cover different revisions and durations;
neither replaces physical route/input/UI measurements.

## Thirty-minute interactive software-latency workload

Revision `47ec472` ran the Rust PTY harness for 1,800 seconds on the built-in
48 kHz stereo f32 route, with 128-frame callbacks. The system PTY was 100×30;
10 key events/s included corrections and visibly rejected unsupported input.
Independent exact-scoring and immediate-redb-write workers ran concurrently.

- All 18,000 scripted keys plus Enter/Ctrl-C were handled; zero sequence gaps.
- Input receipt-to-coordinator p99 upper bound: 1.6 ms; maximum 2.346 ms.
- View submission-to-terminal-draw completion p99 upper bound: 22.8 ms;
  maximum 24.226 ms. This is not physical display presentation latency.
- 674,987 callbacks; zero callback deadline misses or stream faults.
- 29 records replayed; 28 were saved during the run. The one compromised block
  was the deliberate final Ctrl-C interruption, not a stream failure.
- Eight view updates were coalesced by the latest-view queue; no input was dropped.
- More than 7 million background alignments and 30,000 immediate durable writes
  completed. These synthetic records are not evidence of human CW ability.

The [plain-text report](measurements/session-load-2026-11-14.txt) contains all
counters and conservative 100-microsecond histogram upper bounds. Later storage
and policy hardening is verified separately; this result is tied to its revision.
Physical loopback, physical key timing and display presentation remain open.
