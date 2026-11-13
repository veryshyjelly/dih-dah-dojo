# Audio/input spike verification

Recorded 2026-11-14 on the current local Mac; these are short development checks,
not hardware certification or an acoustic latency benchmark.

## Automated checks

- Seven Rust tests pass: six library tests and one allocation instrumentation test.
- Scheduler tests cover 516 character/effective-speed combinations at each of
  44.1, 48, and 96 kHz, checking the reference-word duration and contiguous segments.
- The exact repertoire is 42 distinct symbols and patterns. The earlier planning
  count of 43 was corrected, including the conditional confusion prior's 41 alternatives.
- The allocation guard observes no allocation or deallocation while the prepared
  sample loop runs, including its completed/stopped state. This tests application
  synthesis, not allocation behavior inside the OS or the complete CPAL backend.
- `cargo clippy --locked --offline --all-targets -- -D warnings` passes.
- `inspect PARIS 20 10` reports exactly 288,000 frames at 48 kHz (six seconds).

## Native-device observations

Pinned CPAL 0.18.2, rtrb 0.4.1, Crossterm 0.29.0; no async runtime.

A short E at 20/20 WPM used stereo f32 output at 48 kHz with observed 128-frame
callbacks. Across 182 callbacks, measured application rendering p99 was 0.020 ms;
maximum observed rendering budget utilization was 0.8%.

One initial interactive attempt ended with a generic fault before source-specific
diagnostics were added; its root cause was not established and the result is not
counted as a clean validation. The repeat probe captured `AX`, Backspace, `B` as
attempts `AXB` / final `AB`, and Ctrl-C ended playback successfully. Across 2,497
callbacks, observed sizes were 128 frames, render p99 0.021 ms, and maximum budget
utilization 1.3%. Input receipt-to-coordinator p99 was 0.006 ms across four events.
That tiny input sample is a functional smoke check, not a latency distribution study.

## Still required

No physical loopback, device-to-host clock calibration, physical key timing,
30-minute stress run, route comparison, or callback deadline certification was
performed. Backend playback timestamps are predictions. Callback durations and
buffer sizes alone do not measure sound-at-ear latency or establish zero glitches.

The prototype does not implement dual schedule-slot handoff, character delivery
telemetry, pause/restart, live alignment, rescue, or policy updates. Those remain
explicit tasks in OpenSpec. Full training integration remains gated on engineering
readiness; this spike does not silently close that gate.
