## ADDED Requirements
### Requirement: Complete callsign receiving
The website SHALL offer account-backed, self-paced complete-callsign rounds with
stable hidden-answer material, immediate input, explicit submission, replay,
unknown/reveal, correction feedback and targeted review. Callsigns SHALL have a
first-class destination and a personal progress entry. Existing public references
SHALL remain available without creating practice evidence.
#### Scenario: First attempt and repair
- **WHEN** a learner submits a call and later replays or corrects it
- **THEN** first-attempt whole-call accuracy is retained separately from final accuracy and assistance is visibly labeled
#### Scenario: Explicit unknown versus assisted reveal
- **WHEN** a learner chooses I do not know after independent listening
- **THEN** a blank first submission counts as a first-pass miss; a separately labeled assisted reveal does not create independent evidence and later repair cannot erase either provenance
#### Scenario: Stable replay
- **WHEN** the learner replays or starts copying prepared calls
- **THEN** the material remains identical until explicitly regenerated or advanced
#### Scenario: Signed-out practice
- **WHEN** a signed-out visitor opens callsign practice or personal callsign progress
- **THEN** an in-page sign-in action explains account progress and no independent callsign result can be saved or started

### Requirement: Diverse versioned receiving material
Callsign families SHALL cover short, international, long and slash forms with
original synthetic provenance, deterministic versioned IDs and explicit structural
metadata. Format references SHALL avoid assignment, country or license claims.
#### Scenario: Digit-leading identifier
- **WHEN** a generated call contains digits inside its national identifier
- **THEN** diagnostics follow supplied structure rather than splitting at the first digit
#### Scenario: Reference after disclosure
- **WHEN** a call is disclosed
- **THEN** the learner can hear a missed component or character and return to the same whole call; references do not provide hints during independent listening

### Requirement: Separate durable callsign evidence
Rust SHALL validate and score bounded versioned binary callsign activities. The
existing authenticated owner-scoped synchronization, export/import, restore and
reset flows SHALL retain callsign activity alongside compatible word/story data.
#### Scenario: Malformed or foreign activity
- **WHEN** a packet is invalid, unsupported, stale or belongs to another owner
- **THEN** the operation rejects without changing another account or guided learner state
#### Scenario: Backup round trip
- **WHEN** callsign history is exported and restored or merged
- **THEN** its original attempts, assistance, conditions and structural identity survive and duplicates do not inflate progress

### Requirement: Comparable callsign progress
Progress SHALL show independent exact-call accuracy, character diagnostics,
assistance, history and targeted review, grouped by matching input, pace, corpus,
family, exercise, speed mode and signal conditions. Latency SHALL be explicitly
typing-inclusive and require eight correct independent nonnegative samples.
#### Scenario: Mixed conditions
- **WHEN** clean and impaired sessions or assisted and independent attempts coexist
- **THEN** their evidence remains separately labeled and no unsupported trend or mastery claim is shown
#### Scenario: Adaptive pace
- **WHEN** optional callsign pace adapts within configured bounds
- **THEN** assisted outcomes cannot raise it and guided targets or verified milestones remain unchanged

### Requirement: Operating context and recovery
Exercises SHALL include partial-copy recovery, CQ/DE identification, separately
named serial/zone exchanges and optional noise, fading and overlapping callers.
Callsign and exchange correctness SHALL be scored separately.
#### Scenario: Recovered call
- **WHEN** a learner completes a call after a repeat request
- **THEN** the repaired result is shown without replacing the original independent attempt
#### Scenario: Interrupted signal exercise
- **WHEN** practice is paused, hidden, left or finished during audio preparation or playback
- **THEN** all signal layers stop safely and no delayed completion is counted as independent evidence
