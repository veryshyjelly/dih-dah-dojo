## Purpose
Keep context-specific evidence, timing, confusion, and explicit retention reviews.

## ADDED Requirements

### Requirement: Discounted context evidence
The system SHALL use separate exact-context states with at most 100 eligible outcomes, weights 2^(-age_days/30), and Beta parameters 1+weighted successes and 1+weighted failures as defined in design.md.

#### Scenario: New context
- **WHEN** a speed or mode has no observations
- **THEN** its reference mean is 0.5 with 0.1/0.9 model bounds and no transferred mastery

#### Scenario: Aged observation
- **WHEN** an observation becomes 30 days old
- **THEN** its evidence weight becomes 0.5 without recording a new failure

#### Scenario: Assisted performance
- **WHEN** copying uses rescue
- **THEN** its outcomes update assisted states only

### Requirement: Conditional reliability and latency
The system SHALL require lower model bound >=0.90, effective evidence >=30, and two independent dates for a reliability label, and SHALL summarize at most 30 nonnegative correct independent latencies using nearest-rank quantiles.

#### Scenario: Sparse evidence
- **WHEN** a character has one correct observation
- **THEN** it is not labeled reliable

#### Scenario: Early answer
- **WHEN** a correct response arrives before sound end
- **THEN** its signed latency is retained but excluded from nonnegative latency summaries

### Requirement: Explicit review schedule
The system SHALL initialize per-symbol review intervals at one day, multiply a qualifying due review by 1.7 up to 90 days, and halve other eligible due-review intervals to a minimum ten minutes, without postponing review through early practice.

#### Scenario: Due fluent success
- **WHEN** a due independent review succeeds with latency between zero and 0.8 seconds
- **THEN** the interval grows by 1.7 subject to the cap

#### Scenario: Early practice
- **WHEN** a symbol is practiced before its review is due
- **THEN** its due time does not move later

#### Scenario: Slow correct response
- **WHEN** a due review is correct but takes more than 0.8 seconds
- **THEN** accuracy credit remains and the interval is halved
