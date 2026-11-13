## Purpose
Provide minimal-configuration keyboard practice with reliable playback and interruption handling.

## ADDED Requirements

### Requirement: Automatic mixed sessions
The system SHALL start or resume approximately ten-minute sessions with automatically selected recognition and copying blocks, allow early stopping or continuation, and provide a session summary.

#### Scenario: Normal start
- **WHEN** the learner starts training after initial setup
- **THEN** practice proceeds without requiring manual speed or exercise selection

#### Scenario: Early finish
- **WHEN** the learner ends the session early
- **THEN** completed observations are retained and a summary is available

#### Scenario: Continue
- **WHEN** the learner chooses to continue after the normal endpoint
- **THEN** additional practice is available without discarding the completed session results

### Requirement: Audio readiness and control
The system SHALL offer an audio-readiness check and volume adjustment before scored practice, allow pausing and stopping through keyboard controls, and maintain responsive input during playback.

#### Scenario: Audio check
- **WHEN** the learner tests volume and output before practice
- **THEN** the test is not scored as recognition or copying performance

#### Scenario: Pause
- **WHEN** the learner pauses during practice
- **THEN** playback pauses and the interruption is recorded separately from learner errors

#### Scenario: Input during playback
- **WHEN** playback and typing overlap
- **THEN** the interface continues accepting typing and session-control commands

### Requirement: Timing and interruption integrity
The system SHALL preserve the intended Morse element and spacing relationships at the chosen timing and SHALL distinguish known audio failures, input failures, and explicit interruptions from learner mistakes. Numeric timing tolerances remain a later acceptance-design decision.

#### Scenario: Audio failure
- **WHEN** a playback failure affects a trial or segment
- **THEN** the affected evidence is flagged as compromised rather than used as clean evidence of poor recognition

#### Scenario: Input failure
- **WHEN** an input interruption is detected during a block
- **THEN** affected performance is marked compromised and the learner can recover or stop
