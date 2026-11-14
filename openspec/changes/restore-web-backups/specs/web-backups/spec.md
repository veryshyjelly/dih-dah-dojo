## ADDED Requirements
### Requirement: Integrated backup workspace
Settings SHALL group account and browser export/import controls inside its existing layout before destructive actions, without a detached full-height language-data page.
#### Scenario: Compact settings
- **WHEN** a learner views Settings at compact or desktop width in either theme
- **THEN** backup actions appear in a compact section with no artificial vertical gap or oversized empty card
### Requirement: Previewed full restoration
Signed-in learners SHALL be able to restore a validated account backup after a read-only preview and literal RESTORE confirmation. Restoration SHALL replace only the current owner's saved profiles/history atomically and rotate the reset generation.
#### Scenario: Restore a full backup
- **WHEN** a learner confirms a valid preview against unchanged current progress
- **THEN** saved training state, input profiles and supported history are restored without reapplying learning events
- **AND** old pending uploads cannot recreate pre-restore progress
#### Scenario: Cancel or concurrent change
- **WHEN** preview is cancelled or current progress changes after preview
- **THEN** no imported records are committed and a new preview is required for a conflict
### Requirement: Compatible validated imports
Imports SHALL enforce framing, checksum where present, size limits and Rust content validation before writes. New account exports SHALL retain block IDs and acceptance metadata. Legacy account exports SHALL restore saved state and label history with missing acceptance metadata as extra/imported rather than qualifying evidence.
#### Scenario: Damaged or unsupported file
- **WHEN** a file is truncated, corrupt, unsupported or internally inconsistent
- **THEN** import fails with a usable error and existing progress remains intact
### Requirement: Atomic browser activity merge
Browser word/story imports SHALL preview destination, duplicates and additions, reject conflicting IDs, and merge validated packets atomically. Account imports SHALL use the current reset epoch and existing sync rules.
#### Scenario: Re-import activity
- **WHEN** an identical browser backup is imported again
- **THEN** duplicate records are skipped and progress counts remain unchanged
#### Scenario: Conflicting activity
- **WHEN** an imported ID has different existing bytes
- **THEN** no part of the merge is written
