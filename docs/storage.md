# Transactional binary history

## Selection

The application uses **redb 4.6.0** with **Postcard 1.1.3** binary values. There is
no JSON persistence or JSON codec dependency. Both application storage and encoding
are Rust implementations; the database is embedded and requires no daemon.

The selection follows the user's requirement to research a robust replacement for
JSON and retain the Rust-only direction. The decision is a workload fit, not a claim
that one database is universally fastest or most reliable.

| Candidate | Strength | Tradeoff for this application |
| --- | --- | --- |
| redb | Pure Rust, ACID transactions, stable file format, crash-safe defaults, copy-on-write B-trees | No SQL engine; maintain typed indexes and analytics in Rust |
| SQLite / rusqlite | Extensive crash/I/O/power-loss tests, SQL analytics, mature inspection and backup tools | Adds SQLite's C engine beneath the Rust API |
| Turso Database | Rust SQL engine and SQLite compatibility, production users | Upstream still describes a pre-1.0 project with some experimental features; SQL compatibility is not complete |

Sources: [redb status/features](https://github.com/cberner/redb),
[SQLite testing](https://sqlite.org/testing.html),
[rusqlite bundled engine](https://github.com/rusqlite/rusqlite),
[Turso production/compatibility FAQ](https://github.com/tursodatabase/turso#faq),
[Postcard stable wire format](https://docs.rs/postcard/latest/postcard/).
These sources were reviewed on 2026-11-14. Upstream benchmarks are not application
measurements, and no performance ranking is inferred from them.

## Commit and ownership contract

A dedicated history worker will own writes. No database calls, binary encoding,
commit waits, or filesystem operations may execute in the audio callback/input
capture path. The existing `history::History` API is the storage primitive for that
worker; it does not yet integrate the trainer or learner schema.

Tables:

- `metadata`: explicit application schema version and next event sequence.
- `events`: ordered sequence -> immutable Postcard event payload.
- `head`: latest derived/profile state, rebuildable from the same event history.

`append(record,state)` inserts the event, updates the state, and increments the
sequence in **one `Durability::Immediate` write transaction**. Success is reported
only after commit. Failed serialization, abandoned transactions, or failed commits
must never be presented to the learner as saved progress. On ambiguous I/O failure,
stop writing and reopen/inspect; do not blindly retry an event with a new sequence.

Each serialized value is limited to 8 MiB. Startup rejects unknown schema versions,
missing metadata, and unreadable data. It never deletes a corrupt database or
silently starts a fresh profile. Future schema upgrades must run a declared atomic
migration or refuse the file while preserving it. Keep independent backups before
an upgrade. Do not change enum order/struct layouts under the same app schema.

An OS advisory lock sidecar enforces one trainer process per database. It is released
by the OS after process exit, including crashes; a leftover filename is not a stale
lock requiring manual deletion. The database engine owns its internal transaction
and recovery mechanisms. Preserve files when reporting failures.

Immediate durability relies on OS/filesystem/device sync behavior; application
process-exit tests do not simulate a physical power failure or prove drive-firmware
behavior. Never disable sync just to improve a benchmark.

## Reset and export

`reset("DELETE")` clears event history, derived state, and sequence atomically.
Any other confirmation leaves history untouched. This is logical reset, not secure
physical erasure of freed pages, exported copies, or system backups.

`export(path)` holds one consistent read snapshot and writes a versioned binary
`.cwbackup` archive with a magic header and CRC32 integrity check. Existing files
are never overwritten. Export syncs the completed file and parent directory before
reporting success. A failed export may leave a partial destination: it must not be
reported as complete; `verify_export` rejects truncated/corrupt/unknown-format files.
Do not copy the live database file while it may be changing.

`verify_export` is available as a library operation. Archive restoration is not yet
implemented; export is not a promise that an arbitrary future format can be imported.
CSV progress export can be layered on typed records without changing database storage.

## Verification

Run `cargo test --locked history`. Tests cover committed reopen, process locking,
abandoned transaction rollback, forced child-process exit before commit, reset
confirmation/atomicity, corrupt-file preservation, consistent binary export,
checksum failure, and non-overwriting destinations. Tests use temporary directories,
not the user's practice history.
