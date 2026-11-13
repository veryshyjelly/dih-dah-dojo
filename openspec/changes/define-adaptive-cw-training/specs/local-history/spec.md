## Purpose
Retain one learner’s progress locally with export and reset controls.

## ADDED Requirements

### Requirement: Offline persistence
The system SHALL support one learner practicing and reviewing history offline without an account, and SHALL preserve observations, conditions, assistance, corrections, assessment status, and learning progress across normal restarts.

#### Scenario: Offline practice
- **WHEN** no network is available
- **THEN** training, local progress review, and local history access remain usable

#### Scenario: Restart
- **WHEN** the learner closes and reopens the application after a session
- **THEN** recorded progress and the conditions needed to interpret it remain available

### Requirement: Export and deliberate reset
The system SHALL offer local history export and an explicit reset flow that makes the affected data clear before deletion. Storage SHALL use versioned redb/Postcard binary records, commit raw events and derived state atomically with immediate durability, and export a checksummed consistent binary snapshot. JSON persistence SHALL NOT be used. Unknown or corrupt history SHALL be preserved and rejected, never silently replaced.

#### Scenario: Export
- **WHEN** the learner exports history
- **THEN** the export includes results and the conditions needed to distinguish assisted, corrected, incomplete, and independent performance

#### Scenario: Reset canceled
- **WHEN** the learner cancels the reset confirmation
- **THEN** existing history remains intact

#### Scenario: Reset confirmed
- **WHEN** the learner explicitly confirms deletion of learning history
- **THEN** the chosen history and derived progress are reset consistently

#### Scenario: Interrupted write
- **WHEN** the application process exits before its write transaction commits
- **THEN** reopening recovers the prior committed events and derived state together

#### Scenario: Existing export destination
- **WHEN** the requested export path already exists
- **THEN** export refuses to overwrite it
