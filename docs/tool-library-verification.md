# Tools default and story library polish

The Tools page now opens Word training, matching its first navigation item.
Custom-text browser tests explicitly select Your own words.

The story library uses two columns on desktop and one on compact screens, with
short descriptions, word/time metadata, listening actions and saved listening
progress. Speed inputs are compact. Character coverage moves into independently
operable, closed-by-default disclosures with character chips and unfamiliar-symbol
highlighting. Future transmission text stays hidden and existing playback controls
are preserved. Both light and dark presentations were rendered at 1440px and 320px.

Story selection waits for stored activity to load before restoring a bookmark;
pending writes display Saving rather than an already-saved status. No backend,
content catalog, scoring, timing or native binary format change is involved.

Validation includes TypeScript/Vite/API build, Prettier, OpenSpec strict validation,
whitespace checks and Chromium/WebKit/iPhone-emulation browser regression checks.
The physical timing gate remains open. Browser screenshots are software evidence;
real mobile hardware and physical audio/input timing remain unverified.

Published frontend version: `008c61c1-6168-4e25-8642-f0fc65b8f093`.
Live anonymous smoke verification confirmed Word training selected on entry, six
story cards, closed and independently operable character guides, compact layout,
and no browser errors. No production account data was changed by verification.

All 72 browser checks passed across Chromium, WebKit desktop and iPhone emulation.
