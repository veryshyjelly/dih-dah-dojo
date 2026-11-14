## ADDED Requirements

### Requirement: Unified progress destinations
Your progress SHALL provide Practice, Words and Stories tabs at `/progress`,
`/progress?mode=words` and `/progress?mode=stories`. Missing or invalid mode SHALL
select Practice. Language tabs SHALL support guest-local and current-account
history, while preserving the guided Practice view and its guest sign-in state.

#### Scenario: Reload and browser navigation
- **WHEN** a learner directly opens a language progress URL, reloads it, or uses Back/Forward after switching tabs
- **THEN** the URL, selected tab and displayed progress agree

#### Scenario: Guest progress
- **WHEN** a guest opens Words or Stories progress
- **THEN** locally saved guest activity is available without requiring sign-in
- **AND** no account history is shown or silently imported

### Requirement: Focused practice pages and Settings data controls
Words setup and the story library SHALL replace their data/history disclosures
with compact progress summaries and corresponding View progress links. Summaries
SHALL be hidden during active playback, answering and feedback. Browser export
and DELETE-confirmed guest clearing SHALL be available in Settings alongside
existing account export/reset behavior.

#### Scenario: Inspect progress from setup
- **WHEN** a learner follows View progress from Words setup or the story library
- **THEN** the corresponding progress tab opens with saved activity available
- **AND** the practice page no longer contains the raw recent-history or data-management disclosures

#### Scenario: Cancel guest clearing
- **WHEN** a guest visits Settings and enters anything other than literal DELETE
- **THEN** clearing remains disabled and all guest activity is retained
- **AND** browser activity remains exportable, including locally pending records

### Requirement: Honest word progress metrics
Words SHALL show eligible independent answer count, exact-word accuracy and
distinct independently attempted words for the selected observed context/range.
It SHALL provide requested character/effective pace, daily exact-word accuracy,
and daily mean attempt/final character-accuracy graph cards. Eligibility and
scores SHALL come from existing Rust-derived outcomes.

#### Scenario: Select comparable recorded conditions
- **WHEN** Words progress opens with eligible history
- **THEN** its accuracy context defaults to the latest eligible input method, requested speeds, vocabulary set and word-length band
- **AND** the range defaults to the latest 30 eligible answers with 100 and All available
- **AND** pace points show observed requested speeds within the selected input/vocabulary/length group

#### Scenario: Daily aggregation and missing scores
- **WHEN** selected answers are aggregated into local calendar days
- **THEN** exact accuracy is correct eligible answers divided by eligible answers
- **AND** attempt/final character accuracy uses separate arithmetic means of non-null scores with their sample counts
- **AND** empty denominators display an empty value rather than zero accuracy

#### Scenario: Assistance or interruption
- **WHEN** a history contains replayed, disclosed, repeated, self-reported or interrupted activity
- **THEN** ineligible activity is excluded from independent accuracy and remains readable with distinct labels in history

### Requirement: Readable word history and details
Words progress SHALL provide a searchable word table with eligible answer count,
correct count/rate, assistance count and last activity. Details SHALL expose
recorded answers, permitted expected text, dates, requested pace, input and
outcomes using catalog labels rather than raw IDs as primary text.

#### Scenario: Inspect a practiced word
- **WHEN** a learner searches for and opens a word
- **THEN** its saved attempts and conditions are visible, including separately labeled assisted and interrupted activity
- **AND** the all-activity table is distinguishable from context-filtered chart statistics

### Requirement: Story listening coverage
Stories SHALL show all-time stories started, stories completed and distinct
sentences heard. Heard coverage SHALL count each known story-version/sentence
once if it has a finished, uninterrupted record. Completion SHALL require coverage
of every catalog sentence and SHALL be described separately from accuracy.

#### Scenario: Repeat or interrupt a sentence
- **WHEN** a heard sentence is replayed or another sentence is interrupted
- **THEN** neither event increases unique heard coverage
- **AND** the interrupted sentence contributes only after a finished uninterrupted record exists

#### Scenario: Shortened coverage range
- **WHEN** a learner selects the latest 30 or 100 completed listening events
- **THEN** the cumulative chart retains the earlier full-history baseline and displays actual recorded days
- **AND** replay events cannot inflate unique sentence counts

### Requirement: Story continuation and transcription progress
Stories progress SHALL display coverage, saved position and last activity for each
story, with a Continue listening action. It SHALL provide optional daily mean
attempt/final transcription accuracy using eligible records grouped by story,
requested speeds and input method, with sample counts and 30 / 100 / All ranges.

#### Scenario: Continue a saved story
- **WHEN** a learner activates Continue listening
- **THEN** `/stories?story=<stable-id>` loads the saved bookmark before selecting the story
- **AND** playback waits for the learner to press Play

#### Scenario: Unavailable story link
- **WHEN** the story query refers to an unknown catalog ID
- **THEN** the story library displays an unavailable-story message without starting audio

#### Scenario: Listening without transcription
- **WHEN** a learner has heard stories but has no eligible typed transcriptions
- **THEN** listening coverage is visible and transcription accuracy shows an honest empty state
- **AND** listening completion does not imply correct transcription

### Requirement: Durable and current progress presentation
Language progress SHALL query existing immutable activity and additive catalog
metadata without requiring new persisted fields. Queries SHALL deduplicate owner
activity IDs, refresh after save/sync/reset, preserve account and reset-epoch
boundaries, and distinguish loading, empty, pending-sync and unavailable storage.

#### Scenario: Retry, reset or account change
- **WHEN** activity sync is retried, history is reset, or the active account changes
- **THEN** duplicate activity does not inflate metrics and stale owner/epoch results cannot repopulate the displayed progress

#### Scenario: Existing and unknown records
- **WHEN** the new view encounters existing supported records or unreadable versions
- **THEN** supported history contributes without migration and unreadable packets remain exportable without fabricated metrics

### Requirement: Accessible and bounded evidence presentation
Language charts SHALL use the existing progress visual style with keyboard point
inspection, readable dates/conditions/sample counts and compact/wide light/dark
layouts. They SHALL show actual evidence without invented latency, duration,
round counts, mastery, reliability, trends or guided milestones. Future story
text SHALL remain hidden unless a saved submission or explicit disclosure permits
its display.

#### Scenario: Empty or single-point chart
- **WHEN** a graph has zero or one eligible point
- **THEN** it shows an empty state or an inspectable actual point without extrapolation

#### Scenario: Inspect on a compact screen
- **WHEN** a learner uses keyboard controls at 320px width in either theme
- **THEN** graph points and history details remain reachable with readable text alternatives and no document overflow

#### Scenario: Preserve guided evidence
- **WHEN** word accuracy or story completion increases
- **THEN** guided automatic targets, character estimates and verified milestones remain unaffected
