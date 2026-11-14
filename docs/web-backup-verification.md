# Web backup restoration verification

Date: 2026-11-14. Change: `restore-web-backups`.

Settings now groups account export, browser activity export and import in one
compact workspace between account settings and destructive actions. The detached
word/story page wrapper and its large minimum height are removed. Reviewed
signed-in and guest layouts in light/dark themes at 320, 780 and 1440 CSS pixels;
the automated fixtures check for horizontal overflow and backup placement.

## Data behavior

- New `CWDOJOW2` exports restore keyboard/touch checkpoints, acknowledged block
  metadata and word/story activity. Real WASM tests verify byte-for-byte export
  round trips without replaying blocks into the saved checkpoint.
- `CWDOJOW1` restores saved state while retaining blocks with missing acceptance
  metadata as extra/imported practice. They do not become qualifying evidence.
- Full restore requires a file preview and literal `RESTORE`. Epoch, state
  revision/history baseline and file digest prevent stale previews from replacing
  changed progress. Restoration runs in one SQLite transaction and rotates the
  account epoch. Other accounts and sign-in credentials remain intact.
- `CWLANG01` merges activity. Matching IDs/bytes are skipped; conflicting or
  invalid records reject the batch. Signed-in imports use one authenticated
  atomic batch, tested with 300 records, avoiding per-record request limits.
  Guest imports use one IndexedDB transaction. Pending local bytes survive remote
  conflicts and remain exportable.
- Limits: 32 MiB per file, 10,000 frames, bounded Rust checkpoint/packet decoding.
  Checksums detect damage; they are not proof of file authorship.

## Checks

- `cargo test --locked`: 107 tests passed across the workspace test groups.
- `cargo fmt --check` and strict all-target Clippy: passed.
- Release WASM build and production frontend/server build: passed.
- `npm test`: 9 tests passed, including actual Rust/worker/SQLite round trips,
  owner/origin isolation, malformed files, legacy import, duplicate/conflicting
  IDs, stale cursors and epoch changes.
- A forced SQLite insertion failure rolls back the entire restore, including the
  epoch. Resetting while a restore is being validated rejects the restore.
  Clearing browser storage prevents a delayed save from reintroducing records.
- Browser regression run: 72 passed across Chromium, WebKit and mobile. Final
  backup/help suite after the batch endpoint: 27 passed across the same projects.
  Preview/cancel, literal confirmation, post-restore refresh, progress counts,
  pending conflicts and unchanged automatic training state are covered.
- An earlier full browser run found a help-resume readiness race. Resuming now
  awaits pause cleanup and shows listening until the next trial is ready. The
  affected test passed on all three release browser projects after the fix.
- Prettier and strict OpenSpec validation: passed.
- Wrangler dry run: passed; static assets only, no bindings.

## Deployment

Before installing the API, Python's SQLite backup API created an owner-only
production database snapshot and `PRAGMA integrity_check` returned `ok`:
`backups/dojo-before-backup-import-20261114T155419Z.sqlite` on the API host.

- API release: `20a03cbbacff7f26`; isolated service restarted healthy. Public
  `/health` returned 200 with Google and GitHub ready. Anonymous requests to both
  account import routes and the language batch route returned 401.
- Static frontend version: `c065639b-2c1c-4a07-9888-a9f30eb893bc`, published at
  `https://dojo.veryshyjelly.in`.
- Fresh anonymous browser smoke passed at 1440 and 320 CSS pixels: integrated
  Settings workspace, no overflow, export download, import picker and damaged
  file rejection. No page errors were observed. Screenshots were captured in
  `/tmp/dojo-backup-production-{1440,320}.png` during this session.
- No production account restore or learner data mutation was performed. Full
  replacement and rollback were verified against isolated test databases.

These checks establish software behavior, not physical audio/input timing or
learning effectiveness. The physical timing gate remains open.
