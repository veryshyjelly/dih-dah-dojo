# Rust low-latency architecture

Status: architecture and redb/Postcard binary storage selected; hardware acceptance and corpus work remain.
This document implements the user's Rust-only/native-low-latency direction. It does
not claim an implemented or measured audio engine. Mathematical semantics remain
[cw-policy-v1](design.md).

## Technology decisions

- One native Rust executable, Rust 2024 edition. Use ordinary Rust threads and
  explicit ownership; no Tokio or async executor in the audio/input timing path.
- CPAL for native device output, using its macOS CoreAudio backend. No subprocess
  player, browser audio, shell timing, or sleep-per-dot playback.
- `rtrb` bounded single-producer/single-consumer queues at the callback boundary.
  Allocate queues and audio state before stream start.
- Ratatui for drawing and Crossterm for one dedicated input reader in raw mode.
  Drawing must never be required for key capture or audio progress.
- Keep the mathematical core independent of terminal/audio/storage dependencies.
  Choose the numerical implementation and pin all crate versions in Cargo.lock
  during the first compiled prototype; do not copy signatures from a different
  CPAL release. Version-specific callbacks/timestamps stay inside an audio adapter.
- Native OS APIs are reached through Rust bindings. Rust-only does not mean replacing
  CoreAudio or promising that the OS and every transitive native component are Rust.

Current upstream documentation supports these boundaries:
[CPAL](https://github.com/rustaudio/cpal),
[rtrb](https://docs.rs/rtrb/latest/rtrb/),
[Ratatui input handling](https://github.com/ratatui/ratatui/blob/main/ratatui/src/lib.rs).
CPAL callback and timestamp names have changed between versions; use the selected
release's documented API and test its timestamp semantics on macOS.

## Ownership and execution lanes

| Lane | Ownership and work | Prohibited dependency |
| --- | --- | --- |
| Main/UI thread | Terminal lifecycle, render latest immutable snapshot, restore terminal on exit | Input capture or audio waiting for a redraw |
| Input thread | Only Crossterm reader, timestamp immediately after read, normalize key/control events | Draw, score, or write history before publishing input |
| Session coordinator | Own authoritative session/event sequence and control decisions; consume queues, publish commands and UI snapshots | Full edit-distance recomputation or disk I/O |
| Analysis/planner worker | Compile schedules, update live alignments, perform final scores/statistics and selection | Running any analysis inside the audio callback |
| History writer | Persist ordered event batches and report acknowledgments/errors | Blocking callback or input capture on storage |
| CPAL-managed callback | Own output-frame counter, oscillator/envelope state and active transport; synthesize samples and report bounded telemetry | Allocation, deallocation, locks, blocking sends, file/network I/O, formatting, logging, scoring |

Use channels for commands outside real-time code; real-time exchange uses the bounded
queues or fixed-width atomic controls below. The coordinator polls its input/audio
queues with a nominal 1 ms wait when idle; input can also unpark it. This is a soft
latency target, not a scheduler guarantee. It drains control/input before optional
UI work and before accepting analysis results. UI renders only changed snapshots,
at most 30 Hz; it may skip stale snapshots without losing input events.

Create a single crate initially with `domain`, `timing`, `scoring`, `learner`,
`policy`, `session`, `audio`, `input`, `ui`, and `history` modules. `domain` exposes
immutable values/events; mathematical modules have no CPAL/Ratatui dependencies.
Runtime modules depend inward. A workspace split is unnecessary for v1.

## Callback and schedule contract

Audio time advances in integer **frames**, not interleaved sample count. Every
channel in a frame receives the same mono CW signal. Prefer native f32 output at
48 kHz when supported; otherwise use a supported native sample rate/format with
explicit conversion at the output boundary. Derive all Morse sample boundaries
from the actual selected rate and cumulative rounding in design.md.

Prefer a requested 128-frame buffer if the device reports support. Try 256 frames
if that configuration cannot be built; otherwise use the native default and mark
its latency unverified until measured. At 48 kHz these frame counts correspond to
2.67 and 5.33 ms of audio, not total device or sound-at-ear latency. Observe actual
callback frame counts; do not assume the requested buffer size was honored.

Default tone is a 600 Hz sine, adjustable while idle, gain 0.2 before user volume.
Use 5 ms raised-cosine attack/release inside each scheduled tone, preserving exact
start/end sample boundaries. Clamp ramps to half a short tone's length. Generate
from a preallocated oscillator table/phase accumulator with no callback allocation.
Do not change device, frequency, sample rate, or block C/E while a character sounds.
The tone controls are defaults for audio implementation, not changes to CW policy.

Precompile the complete renderer, source schedule and character metadata outside
playback. A bounded ready queue moves preallocated Box<Prepared> ownership into the
callback; a bounded retirement queue returns it for destruction off-thread. Moving
a Box is constant-size pointer movement, not allocation. A full retirement queue
retains the engine in one pending slot and faults to silence without dropping it.
This safe-Rust ownership protocol replaces the proposed shared two-slot arena and
avoids introducing a custom UnsafeCell synchronization layer. See
[transport proof obligations](../../../docs/audio-transport.md).

Transport advances only while playing; hardware output frames advance through all
silence. Character markers carry actual frame positions, so rescue/pause shifts are
captured explicitly. No unprepared schedule may start. Stream teardown stops output
before callback resources are destroyed outside the data callback.

## Controls and rescue

Emergency stop and pause are fixed-width atomic flags that bypass optional work.
The callback checks them at least at every buffer boundary. Stop/pause ramps the
signal to zero within 5 ms; already submitted hardware audio cannot be recalled.
Resume restarts at a character boundary: an interrupted character is discarded,
marked compromised, and replayed as assisted if practice continues. Any such pause
makes a check incomplete under the existing policy.

The coordinator owns rescue eligibility, using timestamped analysis results for
the current block/revision only. Publish a rescue-request identifier and cancel
identifier via atomics; the callback reads them at character boundaries. The
callback alone decides whether a request is still pending and when added silence
starts in output frames. It reports applied/ignored requests. Changes arriving
after an already rendered boundary may take effect at the next boundary; never
rewrite already submitted audio.

During a rescue, publish an early-release request only after cw-policy-v1's
backlog/500 ms condition is met. Callback frame counts enforce the one-second
minimum and four-second maximum regardless of worker/UI responsiveness. At the
second rescue, the callback terminates the block after the gap and reports the
boundary for the ten-second response tail. No analysis process can create an
unbounded quiet interval by failing to respond.

## Queue limits and backpressure

| Path | Initial capacity | Full/error behavior |
| --- | --- | --- |
| Input -> coordinator | 4,096 fixed-size records | Set fault/stop flag and mark block compromised; never silently drop scored keys |
| Coordinator -> callback | 16 schedule/control records | Outside-callback retry or fail block before start; emergency controls use atomics |
| Callback -> coordinator | 8,192 fixed-size markers | Increment atomic loss counter, silence/abort block, invalidate evidence; no blocking retry |
| Coordinator -> analysis | One in-flight live job plus one latest pending snapshot | Coalesce superseded live jobs only; final scoring jobs are mandatory and serial |
| Coordinator -> UI | Latest snapshot | Replace stale snapshot; losing renders is harmless |
| Coordinator -> history | 4,096 bounded batches of at most 64 events | End/pause active training as compromised before overflow; surface writer failure |

Telemetry queues carry only fixed-size Copy records. Prepared-engine boxes may move
through bounded handoff/retirement queues but must never be destroyed in the data
callback. No Arc clones/drops, Vec/String allocation, or formatting is allowed there. An atomic fault word carries
callback failures even when telemetry is full. Device error reporting records a
small status and requests shutdown; log details and rebuild devices outside audio
execution. No spinning until a full/empty real-time queue changes.

Input preserves a capture sequence, monotonic time and fixed key/control payload.
Disable accepting bracketed paste as scored typing; paste events get a visible
rejection. Accept key press/repeat events as attempts, not release events. Cap any
block at 16,384 accepted input events; reaching the cap ends it as compromised
before further scored input. This prevents pathological input from unboundedly
expanding edit-distance work. Raw terminal timing is receipt time, not physical
key-switch time.

The pure copying scorer additionally limits each alignment to 4,194,304 DP cells,
with at most 16,384 symbols per input. Exceeding the resource limit is an explicit
scoring error, not an omission or learner mistake; callers must mark affected live
results unavailable/compromised rather than publishing partial scores. The numerical
scoring semantics remain exact within the admitted size. This limit is independent
of the input event cap and must be exercised by worker stress tests.

## Analysis, clocks and event ordering

Incremental live alignment runs outside the coordinator/callback, targeting a
fresh result within 20 ms of input processing. Every job includes block ID, input
revision, audio-history watermark, and observation/evaluation time. Stale block
results are rejected. A result more than 100 ms old may be shown as stale but
cannot newly trigger rescue; a rescue already running still obeys callback limits.
A missed analysis freshness deadline is recorded as technical compromise rather
than inferred learner failure. Do not insert rescue based on future data.

Keep all raw observations so final exact alignment can be computed after the
block, even when the UI/live result was coalesced. Complete final scoring and
learner updates before choosing the next adaptive block; show a brief processing
state instead of making policy decisions from an incomplete model. Steady playback
within a block remains independent of analysis throughput.

Use a session monotonic origin. Map reported device playback timestamps to that
origin using callback timestamp pairs and an explicitly recorded stream epoch and
fit/residual. Fit/calibration runs outside the callback; report its uncertainty.
If the selected backend does not provide useful playback timestamps, label estimates
as scheduled-output approximations and do not claim measured sound-at-ear latency.
Sample-relative Morse durations remain accurate even when absolute delivery offset
is uncertain. Device replacement starts a new epoch and compromises the active block.

Within one source preserve its sequence. Coordinator records ingestion order and
all source timestamps/watermarks. Offline event replay uses this recorded order,
not a newly sorted ordering that could make a late telemetry event available early.
At equal logical times use ingestion sequence as the deterministic tie break.

## Acceptance targets and proof obligations

Targets are provisional engineering acceptance criteria, not measured promises:

- Cumulative segment boundary error <= half a sample from ideal timing in pure
  scheduler tests, at every supported device rate.
- In a 30-minute test on the built-in/wired output path, no callback deadline miss,
  unexpected silence, or telemetry/input loss under simultaneous typing, rendering,
  scoring, and history writes. Record observed buffer sizes and any backend limits
  on underrun detection; absent error callbacks alone are not proof of glitch freedom.
- Observed callback execution p99 <25% of its buffer duration and maximum <100% in
  a diagnostic harness. Record preallocated measurements, never callback log lines.
- Input receipt-to-coordinator handling p99 <=5 ms; UI display p99 <=50 ms. Physical
  keyboard-to-terminal latency is outside those measurements.
- Stop/pause receipt-to-output-silence target <=50 ms on a measured local wired path,
  including the 5 ms ramp. Verify with loopback; do not infer it from buffer size.
- Playback timestamp mapping residual p99 <=2 ms where backend timestamps allow it;
  publish measured offset/uncertainty. A mapping residual is not sound-at-ear accuracy.
- Live-analysis target p99 <=20 ms on the supported longest block; >100 ms triggers
  compromise handling. Validate against worst-case repeated symbols and edits.

Use output loopback/capture to inspect envelope boundaries, pause delay, and
unexpected gaps; capture has its own latency and needs offset calibration. Treat
Bluetooth/remote routes as separately measured routes, not automatically certified
by built-in-speaker results. Users may practice on an unverified route with clear
measurement limits; do not advertise that route as latency-validated.

Verify callback allocation/deallocation freedom with a diagnostic allocator guard
scoped to the application callback, not the whole OS backend. Prewarm code and
buffers before measurement. Stress blocked UI, slow analysis, disk stalls, device
loss, full queues, and shutdown. Every fault must end or compromise evidence, never
turn infrastructure delay into a learner weakness.

## Shutdown and remaining work

Stop transport, wait for callback/stream shutdown, retire schedule ownership,
join workers, finalize/flush history with immediate redb transaction acknowledgments, and restore terminal state with an RAII guard. Unexpected exits recover the last committed state through redb; pending writes are
not acknowledged as saved. The callback cannot provide persistence guarantees.

The Rust/runtime/audio/input ownership, statrs fixtures, typed redb records,
dedicated writer, and original CC0 corpus are implemented. Native software
measurements are recorded in docs/session-verification.md. Physical route, input,
and UI acceptance measurements remain open; practice uses explicit unverified
labels. Hardware results may require buffer tuning without altering score semantics.

## Transactional history selection

History uses redb 4.6.0 and Postcard 1.1.3, not JSON. The database's immediate
write transaction atomically commits raw event, derived state, and sequence.
Application schema version is explicit; unknown/corrupt files are preserved and
rejected. One OS advisory lock protects one trainer process. Binary export reads
one consistent snapshot; reset is a confirmed transaction. See
[storage guarantees and research](../../../docs/storage.md) for the comparison,
codec, durability assumptions, tests, and failure behavior.
