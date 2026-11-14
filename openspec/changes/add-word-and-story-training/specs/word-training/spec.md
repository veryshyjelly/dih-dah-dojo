## ADDED Requirements

### Requirement: Public repertoire-aware word selection
The website SHALL offer public English word training with vocabulary, word-length,
repertoire, and existing character/effective pace controls. Selection SHALL default
to ten distinct words of two or three letters and use introduced letters for the
signed-in profile or an explicitly labeled guest repertoire.

#### Scenario: Limited eligible vocabulary
- **WHEN** filters leave fewer than ten eligible words
- **THEN** the trainer explains the smaller round or empty state without silently expanding the repertoire or using assessment material

#### Scenario: Reproducible selection
- **WHEN** catalog version, seed, and filters are unchanged
- **THEN** word selection is reproducible and contains no repeated item within the initial round

### Requirement: Self-paced word response and disclosure
The trainer SHALL support typed responses and listen-and-reveal, keep expected
answers hidden before disclosure, and retain feedback until explicit advancement.
It SHALL offer replay and skip without imposing a response deadline.

#### Scenario: Typed response
- **WHEN** the word finishes and the learner submits an answer
- **THEN** the learner answer and expected word are displayed separately until Next, and the submission key cannot also skip that feedback

#### Scenario: Replay or reveal
- **WHEN** a learner replays before submission or reveals without answering
- **THEN** the trial is labeled assisted or revealed and cannot be reported as an independent correct answer

### Requirement: Honest word outcomes and review
Word summaries SHALL distinguish exact unassisted typed accuracy, skips,
assistance, interruptions, review, and optional self-report. Accuracy SHALL use
completed unassisted initial-round typed trials, including explicit skips, and
show its denominator. Case and surrounding whitespace MAY be normalized;
internal spaces and spelling SHALL NOT be silently corrected.

#### Scenario: No scored answers
- **WHEN** a session contains only listening, reveals, assisted trials, or interruptions
- **THEN** the summary shows no independent accuracy percentage and does not substitute a self-report score

#### Scenario: Missed-word review
- **WHEN** the learner starts a review round
- **THEN** missed or revealed words are labeled repeated material and their results do not rewrite initial-round outcomes
