# Exporting and importing progress

Open **Settings → Your progress, backed up**.

- **Export my history** downloads a full account `.cwweb` backup when signed in.
  It contains synchronized training state, both input profiles, acknowledged
  practice history, words and story bookmarks. Sync pending results first.
- **Export this browser's activity** downloads a word/story/callsign/prosign `.bin` backup,
  including local activity still waiting to sync.
- **Choose backup** checks a file and shows its destination and contents before
  importing. Files must be under 32 MiB and contain no more than 10,000 records.

A full account import replaces the current account's saved progress, including
its sound preferences and training pace. Account identity and sign-in credentials
stay intact. Review the file preview, export the current state if you want to keep
it, and type **RESTORE** to confirm. Cancelling does nothing. If another device
changes progress after preview, choose the file again to get a fresh preview.

A browser activity import merges records into the current guest or signed-in
account. Matching records are skipped. Conflicting IDs or invalid records reject
the whole local merge. Signed-in imports need an online account and synchronize
through the normal activity service. Existing records are retained. Guest files
are never automatically imported merely by signing in.

New account backups use `CWDOJOW2` and preserve the history metadata needed to
restore graphs. Older `CWDOJOW1` files are accepted: their saved training state can
be restored, but they lack server acceptance metadata for historical blocks.
Those blocks remain as imported extra practice rather than qualifying chart or
milestone evidence. The preview identifies this limitation. Browser exports retain
the existing `CWLANG01` length-framed binary format.

Checksums detect damaged account files; they do not prove who created a file.
Only import a backup you intend to use. Import validates content before replacing
anything. Unsupported versions are rejected with no imported changes. Existing
unreadable browser records can still be exported for use with a compatible release.
