## Why

Word training and Story listening are complete practice experiences, but their
placement inside Tools makes them look secondary and harder to discover. They
should be direct destinations alongside guided Practice.

## What Changes

- Add Words (`/words`) and Stories (`/stories`) to the main navigation, in the
  order The studio, Practice, Words, Stories, Tools, Your progress.
- Give each a standalone page retaining its icon badge, polished controls and
  save status, without the toolbox sidebar or introduction.
- Make the studio's three feature cards Practice, Word training and Story
  listening. Preserve Continue Practice and the secondary Explore the tools link.
- Remove these experiences from Tools; its first/default item becomes Your own
  words. Keep the remaining tools in their existing order.
- Adapt navigation for narrow screens and preserve playback cleanup, guest
  access, account sync and saved activity across the new entry points.

## Impact

Frontend routing, navigation, presentation and browser tests only. No new
dependencies, backend endpoints, storage migrations, scoring or training-policy
changes. Words and Stories remain separate from guided progression. The physical
timing gate remains open.

This change follows `add-word-and-story-training`, `polish-tool-library` and
`polish-word-setup`. It supersedes only the Word-training default in
`polish-tool-library`'s Predictable initial tool selection requirement. Preserve
the other library, bookmark and setup requirements. When syncing/archiving specs,
apply the predecessor first, then this change's `tool-library` modification.
