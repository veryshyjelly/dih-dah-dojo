## Purpose
Discover current ability without assuming a fixed starting lesson.

## ADDED Requirements

### Requirement: Evidence-based entry
The system SHALL begin first-use training with a short assessment of current ability, distinguishing unobserved, unfamiliar, and demonstrated proficiency instead of assuming mastery or requiring a fixed beginner sequence.

#### Scenario: Previously encountered symbols
- **WHEN** the learner reports having learned letters previously
- **THEN** the assessment samples current performance and does not mark all letters mastered from that report alone

#### Scenario: Unobserved material
- **WHEN** a supported symbol has not been assessed
- **THEN** it remains unobserved rather than being recorded as a failure

#### Scenario: Unfamiliar material
- **WHEN** the learner indicates that a symbol is unfamiliar
- **THEN** the system can teach that symbol before requiring independent recognition

### Requirement: Supported material
The system SHALL support A–Z, 0–9, and period, comma, question mark, slash, equals, and plus, and SHALL restrict generated training text to the supported repertoire.

#### Scenario: Training text
- **WHEN** a group or plain-text exercise is prepared
- **THEN** its transmitted symbols belong to the supported repertoire

#### Scenario: Incremental introduction
- **WHEN** supported material is unfamiliar to the learner
- **THEN** the system introduces it with instruction and practice rather than assuming prior knowledge
