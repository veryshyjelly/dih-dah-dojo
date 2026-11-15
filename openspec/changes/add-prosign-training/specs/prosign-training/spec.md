## ADDED Requirements

### Requirement: Atomic procedural signal timing
The system SHALL schedule explicit prosign tokens as single Morse units while
preserving existing character scheduling and serialized history.

#### Scenario: Joined AR at Farnsworth pace
- **WHEN** token-mode audio prepares <AR> at character speed above effective speed
- **THEN** all five elements use one-dot internal gaps
- **AND** plain AR continues to use the normal inter-letter gap

### Requirement: Honest sourced reference
The system SHALL explain meanings, joined notation, punctuation aliases and
variable amateur conventions with primary-source links in a public reference.

#### Scenario: Shared sound and differing convention
- **WHEN** a learner explores AR, BT, KN or BK
- **THEN** AR/+ and BT/= are described as shared sounds
- **AND** KN/BK usage variation is labeled rather than presented as universal

### Requirement: Separate exercise evidence
The system SHALL provide recognition, meaning recall and operating-context
practice with separate comparison contexts and account-backed progress.

#### Scenario: First miss repaired after disclosure
- **WHEN** a learner submits an incorrect token then repairs it after reveal
- **THEN** progress retains the independent first miss and assisted final result
- **AND** revisions count as one presentation and do not promote guided targets

### Requirement: Audio and response lifecycle
The system SHALL accept complete token submissions, conceal undisclosed answers,
mark assistance and stop superseded or interrupted audio.

#### Scenario: Leaving a preview or round
- **WHEN** a learner navigates away while audio is preparing or playing
- **THEN** no delayed playback or stale response updates start on the destination

### Requirement: Compatible durable account records
The system SHALL validate versioned prosign records and include them in existing
owner-scoped synchronization, export, restore, import and reset.

#### Scenario: Backup containing mixed activities
- **WHEN** a backup contains existing word/story/callsign and new prosign records
- **THEN** all valid records round trip without altering previous formats
- **AND** another signed-in owner cannot automatically access the original owner's pending records

### Requirement: Comparable progress and evidence limits
The system SHALL separate mode, signal repertoire, input profile, pace and corpus
contexts, label assisted/interrupted results, and show actual observations.

#### Scenario: Sparse latency evidence
- **WHEN** fewer than eight correct independent nonnegative latency samples match
- **THEN** progress explains the missing evidence without inventing latency trends
