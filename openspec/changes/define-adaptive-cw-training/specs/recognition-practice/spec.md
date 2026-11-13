## Purpose
Develop independent sound-to-character recognition and distinguish assisted practice.

## ADDED Requirements

### Requirement: Timed first attempts
The system SHALL capture the first response and its timing for each isolated character and offer an explicit “I don’t know” response. It SHALL distinguish incorrect responses, explicit uncertainty, and unanswered trials.

#### Scenario: Correct but delayed
- **WHEN** a correct response arrives after a substantial delay
- **THEN** correctness and timing remain separately available to assessment

#### Scenario: Explicit uncertainty
- **WHEN** the learner selects “I don’t know”
- **THEN** the trial is recorded as explicit uncertainty rather than a guessed substitution

#### Scenario: No response
- **WHEN** a trial ends without a response
- **THEN** it is recorded as unanswered, subject to interruption handling

### Requirement: Reveal and replay
The system SHALL reveal the correct character and replay its sound after a wrong answer or explicit uncertainty, then revisit the material later. Assisted repetitions SHALL remain distinguishable from independent attempts.

#### Scenario: Wrong answer
- **WHEN** the learner enters a wrong character
- **THEN** the correct character is shown and its sound replayed

#### Scenario: Assisted success
- **WHEN** the learner succeeds immediately after a reveal
- **THEN** that success is not treated as independent evidence of mastery

### Requirement: Latency uncertainty
The system SHALL treat response timing as evidence influenced by recognition, typing, and interruptions, and SHALL avoid asserting a specific cause without sufficient evidence.

#### Scenario: Ambiguous delay
- **WHEN** a delayed correct response has no reliable explanation
- **THEN** the observation remains available without being labeled a proven recognition deficit
