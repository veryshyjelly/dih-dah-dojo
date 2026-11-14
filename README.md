# Dih Dah Dojo

[Live studio](https://dojo.veryshyjelly.in) · [Source on GitHub](https://github.com/veryshyjelly/dih-dah-dojo)

A Morse learning studio for the web, with an offline native Rust trainer for macOS. Recognition and continuous copying
share a persistent learner model. Practice selects material, revisits weak symbols,
introduces new ones, and adjusts character speed and spacing from observed performance.

## Web studio

Practice at [dojo.veryshyjelly.in](https://dojo.veryshyjelly.in). Public listening
tools and the five-sound demo need no account. Guided training and synchronized
progress use sign-in, with separate keyboard and touch profiles. The browser and
native app share Rust timing, synthesis, scoring and training policy through WASM.
The header theme toggle follows your device initially and remembers your choice on this browser.
See [web development](web/README.md) and [deployment evidence](docs/web-verification.md).
Settings supports [exporting and restoring web progress](docs/web-backups.md),
with a preview before importing and explicit confirmation for account replacement.

## Start practicing natively

Requires Rust 1.94+, a real terminal, and a local audio output device.

```sh
cargo run --release --locked
```

Select **Start adaptive session**, check the audio volume, and follow the prompts.
Sessions normally last ten minutes; the current block finishes before a new one is
declined. Placement samples existing knowledge without treating familiarity as
mastery. A new learner starts with contrasting K/M patterns. Recognition uses whole
sound patterns; copying continues while you type.

| Key | Action |
| --- | --- |
| Enter / Up / Down | Choose and confirm menu items |
| Tab | Recognition: “I don't know”; copying: insert a skip space |
| Backspace | Correct the final copy; the original attempt remains recorded |
| F5 | Pause/resume; the affected trial or copying block is excluded |
| F6 | Assisted recognition replay |
| F1 | Progress from the home menu |
| Esc | End practice and preserve completed evidence |
| Ctrl-C | Quit and restore the terminal |

Volume and tone are available in Settings. Changes play a short preview; Space or
F6 replays it. Enter/Esc saves and returns. Speed needs no normal configuration.
Optional overrides apply to a session without replacing automatic speed settings:

```sh
cargo run --release --locked -- train --mode copying --c 20 --e 8
cargo run --release --locked -- train --known all --session-seconds 600
```

`--known` declares an initial repertoire, without granting proficiency. Paste and
unsupported symbols are rejected. The repertoire is A–Z, 0–9, and `. , ? / = +`.

## Progress and local history

History uses **redb transactions and Postcard binary records**. No JSON persistence,
server, account, or network connection is required. On macOS the default location is
`~/Library/Application Support/dih-dah-dojo/practice.redb`; use `--data-dir PATH` or
`CW_DOJO_DATA_DIR` for an isolated profile. One process owns a profile at a time.

```sh
cargo run --locked -- progress
cargo run --locked -- replay
cargo run --locked -- export practice.cwbackup
cargo run --locked -- verify-export practice.cwbackup
cargo run --locked -- reset --confirm DELETE
```

Progress separates recognition, copying, assistance, speed, and material. Checks
are optional, three minutes at a demonstrated speed, and require matching results
on different dates for a milestone. A narrow repertoire never proves alphabet-wide
fluency. Model intervals are approximate; response latency includes typing.

Replay verifies scores, evidence, review updates, and recorded policy transitions.
Export is a consistent, checksummed, non-overwriting binary snapshot; arbitrary
backup import is not implemented. Reset removes local history, not exported or
system backups. Unsupported/corrupt data is refused and preserved.

## Timing and diagnostics

Audio uses a native sample-clock callback with prepared schedules and bounded queues.
Input capture, drawing, alignment, and database writes run on separate execution
lanes. The application callback does not allocate, deallocate, lock, or access disk.

```sh
cargo run --locked -- inspect PARIS 20 10
cargo run --locked -- score AB 'AX\bB'
cargo run --release --locked -- diagnose --seconds 60 --silent --stress --report timing.txt
cargo run --release --locked -- train --latency-report session-timing.txt
```

Backend playback timestamps estimate delivery; they do not measure sound at the ear.
Audio routes remain **physically unverified** until loopback/input measurements are
performed. A 30-minute native stress run reported zero deadline misses or stream
faults; an interactive development run also demonstrated safe exclusion after an
OS-reported underrun. See [verification](docs/session-verification.md) for evidence
and limits. Practice is usable on unverified routes, with provisional latency data.

## Development

```sh
cargo test --locked
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
openspec validate define-adaptive-cw-training --strict --no-interactive
```

Dependencies are pinned in `Cargo.lock`. Tests cover timing, callback allocations,
exhaustive alignment, learner/controller boundaries, scripted sessions, binary
restart, crash recovery, export, and reset. Simulations establish software behavior,
not superior learning outcomes.

The [requirement audit](docs/requirements-audit.md) maps capabilities to evidence.
The [OpenSpec package](openspec/changes/define-adaptive-cw-training/README.md) records
requirements, mathematics, architecture, and outstanding physical verification.
See [storage](docs/storage.md), [learner model](docs/learner-model.md),
[policy](docs/policy.md), and [audio transport](docs/audio-transport.md) for contracts.
