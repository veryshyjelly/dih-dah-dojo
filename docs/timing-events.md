# Timing and event interfaces

`Timing::new(C, E)` accepts character and effective WPM. `Schedule::compile(text,
timing, sample_rate)` validates supported Morse and returns contiguous segments
with integer start/end **frames**. All segment ends are exclusive. Its character
markers contain the onset of the first element and end of the final element;
following silence is separate. `Schedule.frames` includes the final following gap.

```rust
use dih_dah_dojo::timing::{Schedule, Timing};
let schedule = Schedule::compile("PARIS", Timing::new(20.0, 10.0)?, 48_000)?;
assert_eq!(schedule.frames, 288_000); // six seconds, including final word gap
# Ok::<(), Box<dyn std::error::Error>>(())
```

The dit is 1.2/C seconds. Intra-character spacing is one dit. Farnsworth spacing
unit s=(60/E - 31*dit)/19; character and word gaps are 3s and 7s. A word gap replaces
a character gap. Cumulative boundary rounding keeps error within half a sample;
rounding each duration independently would accumulate drift.

`Prepared` owns a complete renderer and immutable character metadata. The callback
moves this Box through ready/retirement queues without allocation or destruction.
`Event` is fixed-size telemetry; `frame` is the monotonically increasing output
frame counter, not source progress. Pauses and rescue consume output frames without
advancing the source. Engine IDs distinguish separate prepared clips.

`ClockMap::observe` consumes already-received callback/playback anchors.
`estimate(frame, rate)` returns estimated **nanoseconds since the shared monotonic
origin**. Input timestamps are captured in that same origin immediately after the
terminal read. Backend predictions remain distinct from measured acoustic onset.

A `Record` stores source onsets/ends, delivery markers, ordered input edits, UTC and
local date context, scores, evidence, and policy boundary snapshots. History keys
provide strict sequence order even when timestamps are equal. `scheduled_ns` is
nominal delivered source time; `rescue_ns` is inserted extra silence. Effective
reference pace with rescue is E*T0/(T0+R). Response-tail time is reported separately
and never enters that denominator. Paused/faulted copying is excluded from pace
qualification. The three-minute assessment window is recorded separately from any
unused full-character scheduling remainder and ten-second response tail.
