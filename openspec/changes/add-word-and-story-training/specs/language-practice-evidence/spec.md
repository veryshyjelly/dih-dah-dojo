## ADDED Requirements

### Requirement: Auditable content and reserved assessment material
Word and story catalogs SHALL have stable IDs, versions, supported transmission
characters, and documented provenance/license. Reserved assessment passages SHALL
NOT be exposed, repurposed, or used to fill these catalogs.

#### Scenario: Catalog build validation
- **WHEN** content contains unsupported symbols, duplicate IDs, invalid sentence boundaries, missing provenance, or reserved assessment material
- **THEN** content validation fails before publication

### Requirement: Isolated activity evidence
Word and story records SHALL preserve input profile, material version, timing,
attempts, assistance, repetition, and interruptions separately from guided records.
They SHALL NOT affect automatic targets, character introduction, verified
milestones, or existing comparable character accuracy/latency graphs.

#### Scenario: Perfect familiar-content session
- **WHEN** a learner correctly repeats every word or story sentence
- **THEN** activity history reflects those results without increasing guided speed or establishing a verified milestone

### Requirement: Durable private activity and bookmarks
The system SHALL provide local guest persistence and owner-scoped signed-in
activity/bookmark synchronization with versioned binary data, server validation,
idempotency, and reset-epoch protection. Guest data SHALL NOT silently enter an
account. Export, reset, deletion, backup, and restore SHALL include new records.

#### Scenario: Retry after outage
- **WHEN** a signed-in activity upload is retried after a lost acknowledgement
- **THEN** it is stored once and pending local data is retained until acknowledged

#### Scenario: Reset races with pending upload
- **WHEN** an old activity upload arrives after a reset
- **THEN** it cannot recreate deleted history or bookmarks

#### Scenario: Different account signs in
- **WHEN** the browser changes account owner
- **THEN** previous-owner pending records and bookmarks are neither shown nor uploaded as the new owner's activity

#### Scenario: Browser storage unavailable
- **WHEN** local persistence cannot be accessed
- **THEN** temporary public playback remains available with an explicit unsaved indicator

### Requirement: Compatible real-time playback and controls
New activities SHALL reuse the Rust/WASM sample-clock audio path, preserve native
binary compatibility and guided controls, and serialize audio ownership. Keyboard
and touch controls SHALL remain usable in compact/wide layouts and both themes.
Dialogs SHALL retain keyboard priority, and interruption SHALL NOT be learner error.

#### Scenario: Navigation during playback
- **WHEN** the learner leaves an activity or rapidly requests another playback
- **THEN** obsolete audio and callbacks cannot overlap or advance the new activity

#### Scenario: Help or browser audio suspension
- **WHEN** help opens or audio continuity is lost
- **THEN** activity pauses, browser interruption is identified, and no unanswered item is scored as incorrect because of that interruption

#### Scenario: Deployment with old clients
- **WHEN** new persistence and frontend support is deployed
- **THEN** existing native records, web history, and older supported clients remain readable and operational without unversioned binary layout changes
