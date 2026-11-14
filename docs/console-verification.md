# Radio console verification

Verified on 2026-11-14 on the local Apple silicon Mac, macOS 27.2 (26B123), using
Rust 1.94, pinned Cargo.lock dependencies and cw-policy-v1.2. The implementation is
in `8c5d7b5`; rendering fixtures are in `da95060`. The final release executable SHA-256
is `f921a5b56803237ce8987808024225071776a86cf126ac1d3c5e17db38a9e1e2`.

## Automated checks

`cargo test --locked` passes 103 tests, including the existing callback allocation,
scoring reference, policy/session, streamed backup and history CLI checks.
`cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`, and strict
noninteractive OpenSpec validation pass for both `polish-radio-console` and
`define-adaptive-cw-training`. No dependency or persisted schema changed.

[Rendering fixtures](../tests/fixtures/console/) cover 15 views at 80×24 and 110×30,
plus monochrome and ASCII variants: 60 reviewable terminal snapshots. Assertions
also cover all 42 large recognition readouts, every response state, transcript-tail
visibility, small windows down to 1×1 without panics, undisclosed target hiding,
separate answer/expected feedback, and absence of color in monochrome buffers.
Pure queries test latest eligible observed contexts, speed/material/repertoire/
policy/corpus separation, independent sample filtering, median/p90, 30/100/all
ranges, six-block trend minimums and paired milestone/repertoire transitions.

## Native keyboard checks

`python3 scripts/verify_console.py target/release/dih_dah_dojo` uses a real macOS PTY,
Crossterm input, CoreAudio, scoring and local binary history with an isolated,
muted synthetic profile. Its small VT reader checks software terminal contents;
it does not detect physical pixels or sound. Native checks cover:

- Four sections, Tab/Shift-Tab, help, empty graphs, range selection and character
  drilldowns; cancelling a partially typed reset confirmation.
- Automatic/coalesced audio previews, Space/F6 replay, leaving/saving, and preferences
  surviving restart without practice credit from previews.
- A digit response remaining visible at 150, 300 and 450 ms, explicit unknown,
  assisted replay, pause/help/resume, resize to 40×12 and 110×30, and early finish.
- A completed 20-response recognition block held for over four seconds, resumed,
  then finished. Its history remains complete without a technical interruption.
- Ctrl-C restoration of the cursor/alternate screen, NO_COLOR output, and successful
  deterministic binary score/evidence/policy replay.

The native transcript is summarized in
[console-native-2026-11-14.txt](measurements/console-native-2026-11-14.txt).
These scripted answers are not evidence of learner proficiency.

## Combined workload

The existing Rust `measure_session` harness ran a 120-second muted native workload
at 100×30 with 10 key events/s, concurrent exact scoring and immediate durable
redb writes. All 1,200 keys plus Enter/Ctrl-C were handled, with zero sequence gaps,
callback deadline misses or stream faults. Input receipt-to-coordinator p99 was
2.8 ms (target ≤5 ms); view submission-to-terminal-draw completion p99 was 20.0 ms
(target ≤50 ms). The one compromised block was the deliberate final Ctrl-C.
See [the full report](measurements/console-load-120s-2026-11-14.txt).

A 60-second repeat used the final release executable and handled all 600 scripted
keys plus Enter/Ctrl-C. Input p99 was 1.5 ms and terminal-draw p99 was 23.3 ms,
with zero sequence gaps, deadline misses or stream faults. Its results are in
[the final report](measurements/console-load-final-2026-11-14.txt). Both workloads
ran alongside the native keyboard harness, using independent temporary histories.
These short runs do not replace the earlier revision-specific thirty-minute run.
An initial sandboxed workload produced no native callback coverage and failed;
only host-audio runs are reported as passing measurements.

## Limits retained

The application audio callback, scoring rules, training policy, binary history and
capture controls are unchanged. UI work stays on the existing rendering thread;
coordinator updates remain capped at 33 ms with bounded latest-view delivery.
State indicators follow actual receive/preview/capture states without a decorative
animation timer. Immediate answered-trial submission bypasses the ordinary refresh
gate, preserving the 500 ms visibility period.

Physical loopback, switch-to-input timing, stop/pause-to-silence and physical display
presentation latency remain unmeasured. OpenSpec engineering-readiness task 1.2 and
the UI change's physical timing gate remain open. Artifact validation, scripted
terminal assertions and these latency samples establish neither physical timing
correctness nor improved learning effectiveness.
