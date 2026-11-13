## Purpose
Personalize material, mode, and speed while retaining uncertainty and review.

## ADDED Requirements

### Requirement: Multidimensional learning state
The system SHALL assess recognition and copying separately while allowing evidence from either mode to inform practice selection. It SHALL distinguish accuracy, latency, confusion, retention, speed conditions, and copying recovery.

#### Scenario: Mode mismatch
- **WHEN** a character is reliable in isolation but weak in copying
- **THEN** copying weakness remains visible and influences practice rather than being erased by isolated success

#### Scenario: Repeated confusion
- **WHEN** a character is repeatedly confused with another
- **THEN** the confusion influences future practice while retaining the direction and training conditions

### Requirement: Balanced personalized progression
The system SHALL use observed performance and uncertainty to balance reinforcement, introduction, challenge, and retention review rather than relying solely on a fixed lesson sequence.

#### Scenario: Return after absence
- **WHEN** previously reliable material has not been practiced for some time
- **THEN** the system can reassess retention without declaring either mastery or regression from elapsed time alone

#### Scenario: Observed regression
- **WHEN** review provides evidence of reduced proficiency
- **THEN** practice emphasizes reinforcement while retaining the prior history

#### Scenario: Progression readiness
- **WHEN** evidence supports introducing unfamiliar material
- **THEN** new material is introduced while previously learned material remains eligible for review

### Requirement: Spacing-first speed adaptation
The system SHALL distinguish character sound speed from effective pace, prioritize spacing adjustments, keep character timing stable within each block, and reconsider character speed between blocks. Recognition and copying SHALL have distinct speed estimates.

#### Scenario: Difficulty adjustment
- **WHEN** a block indicates that the current demand is excessive
- **THEN** spacing is the first speed dimension reconsidered and character timing is not changed midway through a character or block

#### Scenario: Character-speed change
- **WHEN** a character-speed adjustment is warranted
- **THEN** the new sound timing begins at a block boundary

#### Scenario: Conflicting recent results
- **WHEN** neighboring observations fluctuate
- **THEN** the adaptation policy avoids repeatedly oscillating difficulty in response to isolated outcomes

### Requirement: Explainable overrides
The system SHALL briefly explain meaningful practice changes at block boundaries and allow deliberate mode and difficulty overrides. Results SHALL identify overridden conditions.

#### Scenario: Review decision
- **WHEN** the next block emphasizes a recurring confusion
- **THEN** a short explanation identifies the purpose without requiring the learner to configure the exercise

#### Scenario: Manual difficulty
- **WHEN** the learner selects a different difficulty
- **THEN** the choice is respected and recorded so later analytics retain the actual conditions
