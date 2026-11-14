## Why

Dojo currently trains individual characters and continuous copying, but lacks a
dedicated bridge from recognizing characters to following words and meaning.
Word drills and short story listening provide that bridge while offering a calmer,
self-paced alternative to timed practice. The user selected listening to stories,
rather than a branching radio adventure.

## What Changes

- Add public word training with typed answers or listen-and-reveal, short-word
  filters, stable feedback, and review of missed words.
- Add a short story library with sentence playback, replay, reveal, optional
  transcription, continuous listening, and resume bookmarks.
- Bundle reviewed English content with stable IDs, versions, and provenance;
  keep assessment passages unavailable to these activities.
- Store word/story activity separately from guided training and report first
  attempts, assistance, self-reports, interruptions, and completion honestly.
- Preserve the existing Rust/WASM audio architecture, native binary records,
  cw-policy-v1.2, and guided training controls.

## Capabilities

### New Capabilities
- `word-training`: Repertoire-aware word selection and self-paced word practice.
- `story-listening`: A sentence-based story library and listening player.
- `language-practice-evidence`: Content provenance, isolated activity evidence,
  durable history/bookmarks, and compatibility requirements shared by both modes.

## Impact

Changes affect web navigation/player UI, static content, shared Rust content and
scoring queries, WASM interfaces, and separate web activity persistence/API paths.
The existing core copying engine is reusable, but the word loop and story cursor
need dedicated orchestration. There is no new hosted audio-generation service.
The physical timing gate remains open. Research and artifact validation do not
establish runtime correctness or learning effectiveness.

Implementation is staged: shared foundations and word training, then story mode.
This proposal does not include Wordsworth timing, speech synthesis, AI-generated
live stories, branching missions, leaderboards, or automatic speed adaptation.
