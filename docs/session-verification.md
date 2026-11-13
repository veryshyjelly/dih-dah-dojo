# Integrated trainer verification

Recorded 2026-11-14 on the local Apple silicon Mac, macOS 27.2 (26B123).
Pinned dependencies and cw-policy-v1.1 are recorded in Cargo.lock and OpenSpec.

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

`cargo test --locked`, strict Clippy, and rustfmt pass. The suite includes 79 tests:
57 library, 4 history CLI, 2 callback-allocation, 4 scorer CLI, two scoring
references, and ten integrated policy/session traces.

The exhaustive reference checks 1,922 short timed/untimed string pairs. Session
traces use frozen clocks and recorded material to verify delayed recognition,
substitutions, skip/rejoin, correction-heavy copying, stable lag, overload, no input,
bounded difficulty, policy-state replay, tamper rejection, and binary restart.
These traces verify software behavior, not human learning effectiveness.

## Physical verification still outstanding

No physical output loopback, key-switch timing, wired/Bluetooth route comparison,
input-handling latency distribution, or UI presentation latency distribution has
been measured for the integrated trainer. Estimated onset/response latency is
provisional. Callback frame timing is sample-accurate in software; physical delivery
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
