# Word and story practice

Implemented for the public web studio on 2026-11-14. Open Tools → Word training or
Story listening. The implementation follows
`openspec/changes/add-word-and-story-training/`.

## Behavior and content

- Curated original English words and radio abbreviations are selected without
  replacement in Rust. Short-word/repertoire filters disclose small or empty pools.
- Typed word responses have no deadline. Feedback waits for explicit advancement;
  replay/reveal and missed-word review remain separate from independent outcomes.
- Six CC0 practice passages supply the starter stories. Sentence boundaries and
  content IDs are explicit. Assessment passages remain reserved and unchanged.
- Stories support sentence replay/reveal, previous/next, continuous listening,
  optional transcription, and stopped resume bookmarks. Only disclosed text appears
  in the transcript. Completion measures sentences heard, not comprehension.
- Both activities use the existing audio worklet and cancel obsolete completions.
  Browser suspension, help, visibility loss, and F5 pause rather than score misses.
- Rust validates versioned Postcard activity records and derives exact word and
  sentence edit outcomes. Tail-edit snapshots recover append-only attempt input.
  Native Record/Profile and guided progression are unchanged.
- IndexedDB stores guest activity locally and signed-in activity by owner. Signed-in
  uploads use authenticated `/api/language`, immutable IDs, reset epochs, and server
  evaluation. Accepted server sequence orders synchronized bookmarks. Guest activity
  is never silently imported. Online recovery retries retained records.
- Account binary export adds frame type 2 (language activity, version inside payload)
  to CWDOJOW1. Length framing and SHA-256 remain unchanged. Backup/restore operates
  on the entire SQLite database. Browser-only export uses CWLANG01 followed by
  little-endian u32-length Postcard frames. It contains retained packets, including
  unsupported versions, for recovery; no arbitrary binary import UI is provided.
- Settings reset/deletion clear this owner's local activity after server success;
  stale uploads cannot resurrect server data. Guest clearing requires DELETE.

## Verification

Rust workspace tests, formatting and strict Clippy pass. Web/API build and formatting
pass. Seven API/engine tests include owner isolation, duplicate language uploads,
invalid binary rejection, export framing, and reset protection. New browser checks
exercise real WASM playback, stable feedback, concealment, resume bookmarks,
continuous mode, help pausing, both themes and 320/1440 layouts.

The 60-second software workload in
`measurements/word-story-workload-2026-11-14.json` passed existing targets: 565 input
samples, 22,800 timed renders, 120 background score/SQLite commits, 121 restored
blocks, SQLite integrity ok, no errors. Input receipt p99 0.30 ms; next-frame p99
16.70 ms; WASM rendering p99 0.0071 ms / max 1.16 ms; server evaluation+commit p99
5.97 ms. This is synthetic software evidence, not physical sound/input measurement
or a learning-effectiveness study.

Automated keyboard/touch checks use Chromium and WebKit, including iPhone emulation.
Firefox remains unverified because of the previously documented launch failure.
Real Android/iOS hardware and physical output/input latency remain unverified;
the physical timing gate stays open.

## Operations

Before backend deployment a consistent SQLite backup was taken on the phone and
passed integrity_check. API release `7289a85e8ac9ae9d` installed successfully, then
returned healthy with both OAuth providers ready. Existing accounts and supervision
were retained. Deploy the static frontend only after this API support is healthy.

Static deployment: `dc4283be-3739-4a2f-91fe-bb29faee14bc` at
https://dojo.veryshyjelly.in. The complete 66-check browser regression passed; a
subsequent focused run covers the final owner-qualified local storage keys and
contains 15 checks (five word/story cases across three browser projects). Starter
content totals 390 English words, 25 radio abbreviations, and six stories.

All 15 focused checks passed after the local account-isolation change. The live
anonymous browser smoke check verified real word/story audio, hidden future story
text, 320px layout, and an unauthenticated activity response of HTTP 401, with no
browser errors. Production screenshots were reviewed for the wide word player and
compact story player. Signed-in persistence is covered by local authenticated API
and browser-store tests; this release did not create test records in a real user's
production account.
