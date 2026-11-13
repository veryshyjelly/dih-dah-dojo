## Purpose
Define attempt and final scores without inventing character attribution.

## ADDED Requirements

### Requirement: Attempt stream and transcript
The system SHALL retain every accepted printable attempt in an append-only stream and compute final text separately through tail backspaces, uppercase ASCII letters, and reject unsupported symbols visibly.

#### Scenario: Corrected answer
- **WHEN** AB is sent and the learner types AX, backspace, B
- **THEN** the attempt stream is AXB and final transcript AB

#### Scenario: Empty backspace
- **WHEN** backspace is pressed on an empty transcript
- **THEN** no text is removed and the input event remains recorded

### Requirement: Bounded alignment scores
The system SHALL compute time-gated unit-cost Levenshtein distance and accuracy max(0,1-distance/N) separately for both streams, excluding spaces from primary scoring and making N=0 unavailable.

#### Scenario: Correction penalty
- **WHEN** AB is sent with attempts AXB and final AB
- **THEN** attempt accuracy is 50% and final accuracy is 100%

#### Scenario: Skip and rejoin
- **WHEN** ABCDE is sent and ABDE typed
- **THEN** accuracy is 80%, with the later DE still creditable

#### Scenario: Empty target
- **WHEN** no target characters are transmitted
- **THEN** accuracy is unavailable rather than a perfect score

#### Scenario: Premature input
- **WHEN** a typed character precedes the onset of its proposed target
- **THEN** that diagonal assignment is forbidden

### Requirement: All-optimal attribution
The system SHALL update character outcomes only when every optimal alignment agrees on the response index or omission, retaining aggregate score and operation-count ranges for ambiguous cases.

#### Scenario: Repeated symbols
- **WHEN** AAA is sent and AA received
- **THEN** one omission is reported without claiming which occurrence was missed

#### Scenario: Unassigned extra attempt
- **WHEN** AB is sent and AXB typed
- **THEN** X affects aggregate accuracy without becoming a proven A/B confusion
