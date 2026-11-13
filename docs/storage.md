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

A dedicated history worker owns writes. No database calls, binary encoding,
commit waits, or filesystem operations may execute in the audio callback/input
capture path. The `history::History` API is its storage primitive; trainer records and the
profile are committed together. The storage container is version 1; typed practice
records are version 4, with compact replayable policy boundary snapshots. Schema-2
and schema-3 records remain readable; schema 3 added explicit rejected modified-key
input. Schema 4 omits growing exercise/date/passage indexes from policy snapshots
and the committed head. They are rebuilt from immutable presentation/offer records,
with conservative legacy indexes retained. Experimental version-1 practice payloads
are rejected without modifying the file.

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
an upgrade. Do not change enum order/struct layouts under the same declared record/profile schema.

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

`verify_export` is available as a library operation and the `verify-export` CLI. Archive restoration is not yet
implemented; export is not a promise that an arbitrary future format can be imported.
CSV progress export can be layered on typed records without changing database storage.

## Verification

Run `cargo test --locked history`. Tests cover committed reopen, process locking,
abandoned transaction rollback, forced child-process exit before commit, reset
confirmation/atomicity, corrupt-file preservation, consistent binary export,
checksum failure, and non-overwriting destinations. Tests use temporary directories,
not the user's practice history.

## History growth and streaming snapshots

New practice records retain normalized SHA-256 exercise identities in the runtime
reuse index, rather than duplicating whole exercise strings in every before/after
policy snapshot. Raw exercises and offer dates remain in their original records.
`sha2 0.10.9` is pinned; hashing runs off the audio/input capture paths.

A fixture with 1,000 prior exercises makes a legacy policy record exceed 800 KB;
the compact record stays within 32 bytes of its empty-index baseline. Restart tests
verify exercise, passage and offered-date indexes rebuild without losing reuse or
same-day-offer protection.

Export and verification stream the **unchanged Postcard archive format** with an
incremental CRC and bounded buffers. Golden bytes match the earlier serializer,
including multi-byte lengths and sequence numbers. The former 256 MiB verifier
ceiling and whole-archive allocation are removed. Individual values retain the
8 MiB bound. A >9 MiB archive test observes no verifier heap allocation larger
than 64 KiB. Streaming remains a consistent read transaction; it does not copy a
changing live database file or add backup import.
