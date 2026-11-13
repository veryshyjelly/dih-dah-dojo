## Purpose
Apply the versioned sampling, controller, rescue, and assessment decisions.

## ADDED Requirements

### Requirement: Versioned selection
The system SHALL implement the quotas, weakness/review weights, introduction conditions, and context-specific mode/speed controller defined in cw-policy-v1, recording selections and decision reasons.

#### Scenario: Recognition quota
- **WHEN** 20 recognition slots are allocated
- **THEN** weakness/review/coverage/introduction receive 8/5/4/3 slots before empty-category redistribution

#### Scenario: Speed evidence
- **WHEN** two eligible windows qualify at the same speed and material context
- **THEN** effective speed rises by one within bounds

#### Scenario: Small copying blocks
- **WHEN** a copying block has fewer than 20 transmitted symbols
- **THEN** the controller uses the bounded same-context accumulation rule rather than granting a speed increase from that block alone

### Requirement: Conservative bounded rescue
The system SHALL use all-minimum-prefix backlog bounds and require backlog threshold, growth, corroborating inactivity or errors, and cooldown together before rescue; gaps SHALL last one to four seconds with at most two per block.

#### Scenario: Stable lag
- **WHEN** backlog is large but stable
- **THEN** lag alone does not request rescue

#### Scenario: Repeated rescue
- **WHEN** the second rescue completes
- **THEN** the audio block ends, its response tail is allowed, and subsequent copying becomes easier

### Requirement: Comparable unfamiliar checks
The system SHALL use optional 180-second unfamiliar checks with complete characters, a ten-second response tail, no rescue, and at least 95% attempt accuracy; milestone pairs SHALL match speed, repertoire, class, policy version, and text-corpus version when applicable, on different dates.

#### Scenario: Same-day results
- **WHEN** two otherwise qualifying checks share a local date
- **THEN** they do not establish the repeated-day milestone

#### Scenario: Text exhaustion
- **WHEN** no unseen eligible text passage remains
- **THEN** a separately labeled group check may be offered without treating it as an equivalent text result

#### Scenario: Incomplete check
- **WHEN** the learner pauses or stops the check early
- **THEN** it remains incomplete and does not qualify
