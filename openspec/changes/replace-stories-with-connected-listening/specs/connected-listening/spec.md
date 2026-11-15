## ADDED Requirements

### Requirement: Purposeful connected listening
The system SHALL offer phrase and message stages within Words, with distinct
copying, after-listening detail recall and self-reported listening tasks.

#### Scenario: Recall a message detail
- **WHEN** a learner hears a message in detail-recall mode
- **THEN** the factual question appears after playback
- **AND** the expected answer remains hidden until submission or explicit disclosure

### Requirement: Original bounded available material
The system SHALL generate canonical versioned original material within selected
repertoire and requested conditions, with duration estimates and honest availability.

#### Scenario: No suitable phrase exists
- **WHEN** selected characters cannot form any available phrase
- **THEN** setup explains that limitation and offers an explicit repertoire choice
- **AND** it does not silently substitute broader material

### Requirement: Honest first and familiar evidence
The system SHALL retain first submissions, repairs, assistance, interruptions and
familiarity in separate evidence contexts without promoting guided targets.

#### Scenario: Repeated content under another task
- **WHEN** previously recorded audio is presented in another task
- **THEN** its stable content identity permits familiar-material labeling
- **AND** familiarity is described relative to available history rather than guaranteed novelty

### Requirement: Exposure remains distinct from objective accuracy
The system SHALL keep copy accuracy, message-detail correctness and listening
self-reports separate and SHALL not invent mastery or latency metrics.

#### Scenario: Listening without an objective response
- **WHEN** a learner reports partial understanding after listening
- **THEN** progress records exposure and that self-report without an accuracy score

### Requirement: Durable accepted response lifecycle
The system SHALL persist accepted submissions with reset-generation and owner
guards before awaiting UI evaluation and SHALL cancel stale audio or UI work.

#### Scenario: Reset during pending evaluation
- **WHEN** an accepted response is still encoding or evaluating during a confirmed reset
- **THEN** delayed work cannot resurrect the previous activity

### Requirement: Retired Stories remains compatible
The system SHALL remove Stories from primary navigation while retaining original
story identities/text, archive history, old links, bookmarks and backup compatibility.

#### Scenario: Open an old story bookmark
- **WHEN** an existing story link is opened
- **THEN** it identifies the legacy archive and preserves the recorded position
- **AND** playback does not start automatically

### Requirement: Readable bounded progress
Words and connected progress SHALL present clear actions, readable metrics,
bounded graphs/history, explicit context filters and visible focused details.

#### Scenario: Inspect a word with a long history
- **WHEN** a learner selects a word in a populated progress list
- **THEN** the selected state and result details are visible and keyboard reachable
- **AND** pagination prevents the entire history from dominating the page

### Requirement: Loading failures cannot imitate zero progress
The system SHALL represent catalog/activity loading failures independently from
synchronization success and SHALL offer retry without false zero conclusions.

#### Scenario: Catalog fails before synchronization finishes
- **WHEN** content loading fails and activity synchronization subsequently succeeds
- **THEN** the content failure remains visible with retry
- **AND** the page does not present missing content as zero saved progress

### Requirement: Theme-safe selected controls
The system SHALL render selected progress controls with distinguishable valid
foreground and background colors in both themes and at compact widths.

#### Scenario: Selected category in light mode
- **WHEN** a progress category is selected in the light theme
- **THEN** its text remains readable against the selected background

### Requirement: Additive account activity compatibility
The system SHALL validate connected records through additive versioned packets
and include them in owner-scoped sync, export, restore, import and reset.

#### Scenario: Mixed old and connected backup
- **WHEN** a backup contains legacy and new connected activities
- **THEN** valid records round trip without rewriting their original semantics
- **AND** old story exposure never becomes message-detail accuracy
