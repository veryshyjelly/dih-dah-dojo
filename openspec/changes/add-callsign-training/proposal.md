## Why
The existing callsign tool only produces synthetic US-shaped batches. It exposes
the text during listening, regenerates material between actions and records
generic copying rather than whole-callsign skill. Callsign reception needs a
dedicated route from clean complete-call copy to realistic exchange recovery.

## What Changes
- Repair inherited tool-state bugs and make generated material/replays stable.
- Add a first-class Callsigns destination with account-backed complete-call rounds,
  independent first-attempt scoring, assistance and targeted review.
- Add diverse, original synthetic international, long and slash call families,
  explicit format metadata and a reference connected to the sound library.
- Add fixed and optional callsign-only adaptive pace, comparable progress and
  typing-inclusive latency with honest minimum-evidence labels.
- Add partial-copy recovery, CQ/DE context, separately named serial/zone exchanges,
  and optional noise, fading and overlapping-caller conditions.
- Include new activity in existing owner-scoped sync, backup/restore/reset/export
  without changing guided character targets or old activity bytes.

## Impact
Rust/WASM validates and scores callsign activities; React presents them and the
existing activity API stores opaque validated binary packets. Corpus examples are
original synthetic receiving material, not an assigned-station lookup. Physical
audio/input timing and learning effectiveness remain unverified.
