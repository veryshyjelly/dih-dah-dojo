# Repository Guidelines

## Project Structure & Module Organization

This Rust 2024 project currently provides a macOS audio/input prototype for an adaptive Morse trainer.

- `src/timing.rs`: repertoire validation and sample-clock Morse schedules.
- `src/synth.rs`: prepared, allocation-free sample rendering.
- `src/audio.rs`: native CPAL/CoreAudio output and diagnostics.
- `src/input.rs`: dedicated Crossterm keyboard capture.
- `src/main.rs`: prototype commands and coordination; `src/lib.rs` exposes modules.
- `tests/realtime.rs`: renderer allocation instrumentation.
- `openspec/changes/define-adaptive-cw-training/`: requirements, mathematics, architecture, and tasks.
- `docs/`: verification evidence and limitations. No training corpus is bundled yet.

## Build, Test, and Development Commands

Use Rust 1.94+ and preserve dependency versions in `Cargo.lock`.

```sh
cargo build --locked
cargo test --locked
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo run --locked -- inspect PARIS 20 10
cargo run --locked -- probe PARIS 20 5
cargo run --locked -- probe E 20 20 --no-input
openspec validate define-adaptive-cw-training --strict --no-interactive
```

`inspect` needs no audio device. Interactive `probe` requires a real terminal; shell runners without a TTY must use `--no-input` for audio-only checks. Playback requires a local output device.

## Coding Style & Naming Conventions

Use rustfmt defaults, four-space indentation, `snake_case` functions/modules, `PascalCase` types, and `SCREAMING_SNAKE_CASE` constants. Keep mathematical code independent of terminal and device APIs. Use explicit errors for invalid configuration and bounded communication for real-time paths.

The audio callback must not allocate, deallocate, lock, block, log, access disk/network, or perform learner analysis. Keep input capture independent of drawing.

## Testing Guidelines

Use Rust's built-in unit and integration tests with descriptive behavior names. Cover mathematical fixtures, boundary cases, timing invariants, and callback-sensitive changes. No percentage coverage threshold is established. Keep hardware tests separate; document device, observations, and unmeasured limits in `docs/prototype-verification.md`.

## Commit & Pull Request Guidelines

Follow existing `feat: ...` and `docs: ...` commit subjects. Make coherent, incremental commits with relevant checks passing. PRs should explain the problem, behavior changes, validation, and remaining limitations; link relevant OpenSpec tasks and issues when available. Include terminal output for CLI changes.

## Planning & Agent Guidance

Follow `cw-policy-v1` and the engineering-readiness gate. Update specs alongside behavior changes. Never equate artifact validation with runtime correctness or learning effectiveness. Fetch current library documentation through Context7, resolving the library ID before querying its docs.
