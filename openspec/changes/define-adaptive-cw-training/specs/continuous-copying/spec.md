## Purpose
Support ongoing typed reception, corrections, rejoining, and automatic rescue.

## ADDED Requirements

### Requirement: Ongoing transmission and corrections
The system SHALL transmit while the learner types and allow backspace corrections while preserving first responses, edit events, and their timing separately from the final transcript.

#### Scenario: Correction
- **WHEN** the learner replaces an incorrect character with the correct character
- **THEN** final transcript accuracy may improve while the original attempt and correction remain available

#### Scenario: Typing during audio
- **WHEN** the learner types while a character is transmitted
- **THEN** input remains capturable without requiring playback to wait for each response

### Requirement: Recovery and attribution uncertainty
The system SHALL allow missed material followed by rejoining and SHALL distinguish confidently attributed responses from uncertain associations. A local omission SHALL NOT automatically invalidate all later copying.

#### Scenario: Skip and rejoin
- **WHEN** the learner misses one character and correctly copies later material
- **THEN** the later material can receive credit independently of the omission

#### Scenario: Ambiguous repeated sequence
- **WHEN** multiple transmitted positions plausibly correspond to a typed response
- **THEN** the system preserves attribution uncertainty rather than inventing a precise character weakness

### Requirement: Automatic catch-up rescue
The system SHALL provide a bounded quiet interval after a completed character or group when evidence indicates overload during practice. It SHALL preserve character sound timing, distinguish rescue from ordinary spacing, and avoid treating delayed typing alone as sufficient proof of overload.

#### Scenario: Rescue during practice
- **WHEN** overload warrants intervention while a character is sounding
- **THEN** the character finishes before the catch-up interval begins

#### Scenario: Repeated rescue
- **WHEN** a practice block needs repeated rescue
- **THEN** the next block becomes easier and the reason is briefly explained

#### Scenario: Intentional lag
- **WHEN** typing is delayed but the learner is maintaining accurate copying
- **THEN** delay alone does not require rescue

#### Scenario: Bounded intervention
- **WHEN** a rescue interval reaches its configured bound
- **THEN** it does not silently extend into an unlimited pause; the interval ends after at most four seconds; a second rescue ends the block and the next copying block becomes easier

### Requirement: Delivered pace
The system SHALL report rescue occurrences and actual delivered pace including rescue time, separately from requested pace.

#### Scenario: Assisted completion
- **WHEN** a block finishes after one or more catch-up intervals
- **THEN** results identify assistance and do not label the initial requested WPM as the sustained delivered pace
