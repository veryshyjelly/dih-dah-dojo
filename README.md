# Dih Dah Dojo

A native Rust adaptive Morse trainer in development. The current executable is an
**audio/input engineering prototype**, not the finished adaptive trainer.

## Run

Requires Rust 1.94+ and a local audio output device for playback. The currently
exercised platform is macOS. Dependencies are pinned in Cargo.lock.

```sh
# Compare copying without audio or a terminal:
cargo run --locked -- score ABCDE ABDE
cargo run --locked -- score AB 'AX\bB'

# Inspect the exact schedule without opening audio hardware:
cargo run --locked -- inspect PARIS 20 10

# Play at 20 character WPM and 5 effective WPM; type while listening:
cargo run --locked -- probe PARIS 20 5

# Noninteractive, short audio-device smoke test:
cargo run --locked -- probe E 20 20 --no-input
```

The probe uses a quiet 600 Hz tone with a 5 ms envelope. Adjust system output volume
before playing. Esc or Ctrl-C fades playback out; Backspace edits the final
transcript while preserving the attempt stream. Bracketed paste and unsupported
characters are rejected. The terminal is restored on normal exit or Rust unwinding.

The prototype compiles a complete schedule before playback, renders from a sample
clock in a native CPAL/CoreAudio callback, and captures keys on a separate thread.
The main thread displays changed transcripts and collects diagnostics. It prints
actual callback frame counts, callback rendering time, and input receipt-to-main
latency. A queue/device/input fault marks the probe compromised instead of silently
pretending it was a successful run.

Current limits: blocks must fit in 180 seconds and contain at most 4,096 normalized
characters/spaces. The hardware adapter supports f32/f64/i16/u16 device formats;
other native formats produce an explicit error. It prefers 48 kHz f32 and requests
128, then 256 frames where supported, otherwise the device default. Observed callback
sizes, not requests, are the evidence for the actual buffer configuration.

## Verify

```sh
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
openspec validate define-adaptive-cw-training --strict --no-interactive
```

Tests cover the exact 42-symbol repertoire, PARIS/Farnsworth timing over the
automatic speed grid at three sample rates, spacing, invalid input, envelope/gap
integrity, bounded stop fade, and allocation/deallocation-free sample rendering.

See [prototype verification](docs/prototype-verification.md) for observed results
and limitations. Physical output latency, clock calibration, long-run glitch
freedom, pause/resume, rescue, adaptive training, live playback scoring, durable history, and a
polished TUI are not implemented or certified by this spike.

The [offline scorer](docs/scoring.md) now implements attempt/final scores, time-gated
alignment, and conservative attribution. It is not yet connected to live playback
and does not update a learner model. `score` runs in shell runners without a TTY.

## Design and next work

The [OpenSpec package](openspec/changes/define-adaptive-cw-training/README.md)
contains the product requirements, mathematical policy, Rust architecture, and
implementation checklist. Engineering prototype work may proceed before closure
of the readiness gate; full trainer integration still needs the remaining
measurement, numerical-library, persistence, and corpus decisions.

Development uses coherent milestone commits, with checks recorded for each step.
