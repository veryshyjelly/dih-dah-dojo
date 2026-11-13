## Purpose
Measure transferable progress without confusing assistance or familiarity with fluency.

## ADDED Requirements

### Requirement: Optional steady checks
The system SHALL sometimes offer clearly labeled optional checks using unfamiliar material at a stable pace without automatic rescue. The learner SHALL be able to decline or stop a check without losing practice history.

#### Scenario: Check offered
- **WHEN** a session includes a progress check
- **THEN** the learner is informed of its steady-pace and no-rescue conditions

#### Scenario: Check stopped
- **WHEN** the learner stops before the intended endpoint
- **THEN** the check is retained as incomplete and is not scored as a completed milestone

#### Scenario: Check declined
- **WHEN** the learner declines a check
- **THEN** ordinary practice remains available

### Requirement: First fluency milestone
The system SHALL recognize the first sustained-copying milestone only after three minutes of unfamiliar material at at least 95% attempt accuracy without rescue, repeated on another day at the same steady speed and comparable conditions. It SHALL display the attained speed and tested material.

#### Scenario: Repeated qualifying performance
- **WHEN** qualifying checks occur on separate days at the same speed under comparable conditions
- **THEN** the milestone is recorded with the speed and material coverage

#### Scenario: Corrected transcript only
- **WHEN** final transcript accuracy reaches 95% but attempt accuracy does not
- **THEN** the check does not satisfy the milestone

#### Scenario: Assistance used
- **WHEN** a practice block meets duration and accuracy targets but includes rescue
- **THEN** it does not count as an unassisted qualifying check

#### Scenario: Different conditions
- **WHEN** qualifying-looking results use different speeds or materially different conditions
- **THEN** they remain separate evidence rather than silently establishing a repeated milestone at the higher speed

### Requirement: Honest progress reporting
The system SHALL separate attempt and final accuracy, assisted and unassisted performance, and familiar practice from unfamiliar checks. It SHALL expose insufficient evidence and avoid extrapolating mastery beyond tested material and speeds.

#### Scenario: Repetition advantage
- **WHEN** accuracy improves on repeatedly practiced material without improvement on unfamiliar checks
- **THEN** analytics distinguish practice improvement from demonstrated transfer

#### Scenario: Sparse evidence
- **WHEN** a symbol has very few independent observations
- **THEN** its mastery estimate is presented with uncertainty

#### Scenario: Progress review
- **WHEN** the learner opens progress
- **THEN** the view includes character weaknesses, latency trends, confusions, retention, accuracy by difficulty, speed history, and sustainable-copying evidence with relevant conditions
