# Persistent audio transport

`transport.rs` is a device-independent sample-clock kernel. `live_audio.rs` connects
it to a persistent CPAL/CoreAudio stream; `clock.rs` translates observed device
clock pairs into the session's monotonic time. The earlier single-block `probe`
remains available independently while trainer integration proceeds.

## Ownership and callback work

Prepare a complete `Prepared` renderer off-thread, including the immutable schedule,
oscillator table, character metadata and envelope settings. Move its existing Box
through a two-slot SPSC queue; moving ownership allocates nothing. The callback
renders samples and publishes fixed-size telemetry. It returns finished renderers
through a two-slot retirement queue; the control thread destroys them.

If retirement is full, retain the renderer in a bounded pending slot, publish an
atomic fault and render silence. Never drop it or block trying to return it in the
callback. This safe-Rust ownership protocol replaces the earlier proposed shared
schedule arena; it avoids a custom UnsafeCell implementation without changing the
allocation-free playback requirement. Terminal rendering, exact alignment, model
updates, encoding, database operations and destructors stay off the data callback.
The stream is stopped before callback-owned resources are destroyed at teardown.

## Control semantics

The output frame counter advances through sound, ordinary gaps, pauses and rescue.
The source schedule advances only while playing. Markers carry actual rendered
output-frame positions, including the effects of inserted quiet time.

- Stop/pause flags bypass regular queues and fade sounding output over five ms.
- Pause marks the current observation compromised. Resume restarts at a character
  boundary; it cannot silently create a qualifying assessment.
- Rescue requests can be canceled before the character boundary. Applied rescue
  lasts at least one and at most four seconds, even if the coordinator stalls.
- The second rescue ends the block after its gap; the response tail is coordinator
  work. No third rescue is possible in that block.
- Device/telemetry faults compromise the block rather than becoming learner errors.

## Clock contract

Every callback publishes its output frame and backend callback/playback timestamps
alongside host receipt time. The coordinator uses a rolling 64-pair median offset;
residual p99 is exposed, and eight pairs are required for the calibrated flag.
A backward device clock requires a new stream epoch. Conversion uses the latest
already-observed anchor, never future timestamp observations. Backend playback time
is a prediction, not measured acoustic onset. Physical output delay still requires
the documented loopback protocol.

## Verification

`cargo test --locked transport`, `cargo test --locked clock`, and
`cargo test --locked --test realtime` cover exact character markers, retirement,
queue-full ownership, pause/restart, emergency stop, rescue boundaries/maximum,
clock offset conversion and backward-clock rejection. The diagnostic allocator
observes zero allocation/deallocation in prepared sample rendering and transport
handoff, including a deliberately full retirement queue.
