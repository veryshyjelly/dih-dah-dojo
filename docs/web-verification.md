# Web trainer verification — 2026-11-14

## Implementation boundary

The native application's Rust timing, synthesis, transport, transcript, scoring,
learner, planner, controller, recording and progress queries now live in
`crates/dojo-core`. Native module paths re-export the same types. Record field
layout, event discriminants, Postcard schemas and native redb storage stay intact.
WASM injects wall/input/sample clocks and adds a separate versioned web checkpoint
and upload envelope. Native and web history are deliberately separate.

The browser runs policy/scoring in a dedicated WASM worker. Its worklet uses the
original Rust transport/kernel and preallocated output/marker buffers. JavaScript
preparation and boundary messages can allocate; the Rust sample-render loop retains
its native allocation-free contract. No claim is made that the entire browser
runtime has hard real-time behavior. Clips retain the existing three-minute maximum.

## Checks

| Check | Result |
| --- | --- |
| `cargo test --locked` | 103 workspace/unit/integration tests passed |
| `cargo fmt --check` | Passed |
| `cargo clippy --locked --all-targets -- -D warnings` | Passed |
| WASM release + matching wasm-bindgen 0.2.130 | Passed |
| TypeScript + production Vite/API build | Passed |
| API/WASM Node suite | 6 tests passed |
| Chromium, WebKit desktop, iPhone 14 emulation | 24 browser regressions passed; see coverage below |
| `openspec validate build-public-web-trainer --strict --no-interactive` | Passed |
| Wrangler static deployment dry run | Passed |

Browser coverage includes public operation with accounts unavailable, all 42
reference symbols, tool validation/selection, real Rust worklet playback, digit and
punctuation responses, the 500 ms visibility period, pausing and finishing,
responsive touch keys, saved-summary hold without changing evidence, reset
cancellation, long rapid tail editing, viewport bounds, and actionable long-clip
errors, coalesced previews and cancellation on navigation. Screenshots were inspected in native Zen and automated desktop/mobile
captures. Browser account fixtures use test-only intercepted HTTP and real Rust
checkpoint/packet evaluation; production contains no authentication bypass.

The bundled Playwright Firefox process could not start on this host: it reported
“Could not find profile folder” before opening a page, including a retry with a
canonical `/private/tmp` profile directory. This is an unverified browser target,
not a passing Firefox result. Real Android/iOS devices were not tested; iPhone
coverage is WebKit device emulation.

API checks cover owner/input-profile isolation, exact mutation Origin, binary
checkpoint/scoring parity, export SHA-256, duplicate upload idempotency, stale
multi-device uploads, revision conflicts, reset cancellation/generations (including resets during upload evaluation or preference updates), SQLite
backup restoration, replay/unknown/timeout distinctions, interrupted copying,
manual evidence exclusion, and malformed/oversized records.

## Combined workload

[Measured output](measurements/web-load-60s-2026-11-14.json) records a 60-second
synthetic Chromium session with actual muted browser audio and continuous copying,
concurrent Rust evaluation and FULL-synchronization SQLite commits, and separate
instrumented WASM render calls. The script uses disposable users/data and never
adds these results to a real learner's history.

| Observation | Value |
| --- | --- |
| Injected input events | 559 |
| Background evaluated/committed blocks | 120 |
| Timed 128-frame WASM render calls | 22,800 |
| Input receipt to capture-handler p99 | 1.4 ms |
| Handler to next animation frame p99 | 17 ms |
| Instrumented WASM render p99 / max | 0.0069 / 0.798 ms |
| Server evaluate + SQLite commit p99 | 4.68 ms |
| Restored blocks / SQLite integrity | 121 / ok |
| Browser/workload errors | 0 |

These software input/display samples satisfy the existing 5/50 ms software targets.
The instrumented renderer's p99 is below 25% and its maximum below one 128-frame,
48 kHz buffer. These are separately timed synthetic render calls; the worklet's
physical callback duration, acoustic silence latency, sound-at-ear timing, browser
clock residual distribution, and physical key-switch latency remain unmeasured.
`requestAnimationFrame` is a software presentation opportunity, not proof of pixels
appearing at that instant. This short development-host load is not a prolonged
phone concurrency/capacity test or evidence of learning effectiveness.

## Deployment evidence

- Cloudflare served the frontend and API health over their intended HTTPS domains
  in a real browser. The deployed page loaded without browser errors.
- The static frontend uses no server functions or paid bindings. The phone API
  listens only on loopback and the added Tunnel route preserves the SSH route.
- The ARM64 Debian dependencies and native SQLite were installed privately. The
  original services and shared Node/PRoot runtime were not upgraded.
- The owner supplied GitHub credentials privately and confirmed successful live
  sign-in. The exact callback was registered without wildcard matching.
- The owner configured Google credentials privately. The API reports both providers
  ready; the live Google button reaches Google with the exact callback, code flow,
  and only `email profile openid` scopes, without browser errors. The owner confirmed
  the complete Google sign-in round trip. Google production audience status still
  requires owner confirmation.
- The initial PRoot restart timeout was reproduced and fixed with a scoped runit
  control handler. Two subsequent service restarts succeeded without re-entering
  secrets. A full Android reboot remains untested.
- A consistent phone SQLite backup was copied off-device and passed
  `PRAGMA integrity_check` with all eight schema tables present. Populated backup
  ownership/record restoration was additionally checked in the isolated API and
  combined-load suites. Ongoing off-device backup scheduling is owner-managed.

The physical timing gate in the original training change stays open. Artifact
validation, software tests and emulation do not close it.

Final published frontend version: `02c97ec4-d58e-420e-9d42-0dd3ae538362`.
Final installed API release: `0e086ebfdce82c0a` (checksummed package and healthy restart).
The live recognition readout kept the same position through disclosure, rendered
its correction inline, and loaded the privacy route without browser errors.
