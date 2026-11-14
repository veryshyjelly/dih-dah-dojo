## ADDED Requirements

### Requirement: Public short story library
The website SHALL offer original or explicitly licensed English stories with stable
content versions and sentence IDs. Cards SHALL describe required characters and
duration estimated from the selected transmission pace, excluding learner pauses.

#### Scenario: Story contains unfamiliar characters
- **WHEN** a story requires characters outside the signed-in introduced repertoire
- **THEN** the library identifies them while allowing deliberate playback without altering guided introduction state

### Requirement: Sentence-based listening and disclosure
The story player SHALL default to sentence-by-sentence listening with replay,
previous, reveal, and manual next controls. Revealed sentences SHALL remain readable
without exposing future text visually or through the accessibility tree.

#### Scenario: Replay current sentence
- **WHEN** the learner requests replay
- **THEN** only the current sentence restarts and the story does not advance because of a stale playback completion

#### Scenario: Reveal then continue
- **WHEN** a sentence is revealed and the learner advances
- **THEN** that sentence remains in the disclosed transcript while the next sentence remains hidden

### Requirement: Continuous listening and optional transcription
The story player SHALL support continuous listening with boundary-safe transitions
and optional sentence transcription using existing attempt/final scoring. Listening
alone SHALL NOT require typing or generate an accuracy score.

#### Scenario: Continuous playback
- **WHEN** a sentence finishes in continuous listening mode
- **THEN** the next sentence plays without automatic text disclosure and every sentence remains individually replayable

#### Scenario: Sentence assistance
- **WHEN** a typed sentence attempt includes replay or answer reveal
- **THEN** its result retains assistance labeling and is separate from an independent attempt

### Requirement: Resumable story position and completion
The player SHALL persist version-aware bookmarks and resume stopped at the saved
sentence. Completion SHALL mean every sentence finished playback at least once,
not demonstrated comprehension or mastery.

#### Scenario: Reload after a partial sentence
- **WHEN** the learner returns after interruption or reload
- **THEN** the player restores the sentence position without autoplay and restarts that sentence on explicit play

#### Scenario: Content version unavailable
- **WHEN** a saved bookmark refers to an unavailable version
- **THEN** the application preserves historical evidence and offers an explicit restart rather than silently mapping the bookmark onto changed text
