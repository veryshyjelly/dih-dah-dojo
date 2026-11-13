# Offline history commands

These commands work in a shell runner without a TTY or audio device. Data lives in
`~/Library/Application Support/dih-dah-dojo/practice.redb` on macOS. Use
`--data-dir PATH` or `CW_DOJO_DATA_DIR` to select an isolated profile directory.

```sh
cargo run --locked -- progress
cargo run --locked -- replay
cargo run --locked -- export my-practice.cwbackup
cargo run --locked -- verify-export my-practice.cwbackup
```

`progress` shows context-specific evidence and uncertainty, response-latency
summaries, due review, directed confusions, recent copying conditions, and repeated-day
milestones. Unknown speeds do not inherit proficiency. `replay` checks deterministic
score/evidence reconstruction, review updates, controller state and decision reasons
from recorded source observations and policy boundary snapshots; it does not claim
to recover unrecorded acoustic timing or validate a learning-effectiveness hypothesis.

`export` creates a checksummed binary snapshot from one consistent database read
transaction and refuses existing destinations. `verify-export` checks its format
and integrity without opening local practice history. Export/verification is not
an implemented arbitrary restore/migration feature.

To intentionally delete all local learning history and derived state, use
`cargo run --locked -- reset --confirm DELETE`. Missing or different confirmation
leaves data unchanged. Exported backups are not deleted. Reset is logical deletion,
not a secure wipe of freed pages or system backups.

One trainer process owns a profile at a time. A second command on the same profile
fails with a lock error. Corrupt or unsupported files are preserved and rejected;
never delete them automatically or silently substitute a new learner profile.

## Device diagnostic

```sh
cargo run --release --locked -- diagnose --seconds 30 --silent --stress --report result.txt
```

`--silent` exercises actual native rendering with zero output gain. `--stress` runs
exact alignment and immediate redb transactions on separate workers, using temporary
data that is cleaned up after completion. The report is plain text, not JSON. It
records observed buffers, callback render budgets, detected misses, stream faults,
and clock-mapping residual. No physical loopback is performed, so it cannot certify
sound-at-ear latency or physical key-switch timing.

## Interactive software latency report

`train --latency-report FILE.txt` reserves a new plain-text diagnostic report and
writes it after normal shutdown. It refuses to overwrite an existing path. Bounded
histograms record input receipt-to-coordinator, view submission-to-draw completion,
draw duration, callback work and queue/commit counters; p99 values are conservative
100-microsecond bucket upper bounds. Metrics run off the input/audio capture paths.
Draw completion measures terminal output submission, not physical presentation.

For a reproducible macOS synthetic workload, build and run:

```sh
cargo build --release --locked --bins --examples
target/release/examples/measure_session 1800
```

The Rust harness uses the system `script` utility to provide a 100×30 PTY, injects
10 key events/second (including corrections and unsupported input), and drains
output while native muted audio, exact scoring and immediate redb writes run. Its
profile and load database are isolated under the system temporary directory. It
requires continuous callback/practice coverage, handled input counts, zero sequence
gaps/deadline misses/faults, latency targets and successful history replay. Synthetic
learning records are not human proficiency evidence and never touch the normal
profile. Preserve the printed report path on failure; do not call a failed run a
physical-route certification.
