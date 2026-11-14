## Why
Settings renders language data as a second full-height page, creating a large gap and an oversized card. Existing exports have no matching import workflow.
## What Changes
- Integrate backup controls into Settings above destructive actions, with compact grouped account and browser backups.
- Restore full account backups after validated preview and typed RESTORE confirmation; merge browser word/story backups without replacing existing activity.
- Add a checksummed binary account format preserving block IDs, accepted/extra-practice status and derived records; support legacy account exports conservatively.
- Validate before any mutation, commit full restores atomically, rotate reset generations and reject concurrent profile changes.
## Impact
Frontend, Rust validation boundary and authenticated API. New exports use CWDOJOW2; CWDOJOW1 and CWLANG01 remain readable. No new dependencies. The physical timing gate remains open.
