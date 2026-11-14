## ADDED Requirements
### Requirement: Accessible console navigation
The UI SHALL provide Dashboard, Practice, Progress and Audio idle sections, a consistent console shell, contextual controls, NO_COLOR and --plain support, a complete 80x24 layout and extra panels at 110x30.
#### Scenario: Active response
- **WHEN** the learner types digits or punctuation during practice
- **THEN** they remain Morse responses, section navigation does not intercept them, and F5/F6/Esc/Ctrl-C retain existing meanings
#### Scenario: Resize
- **WHEN** the terminal becomes smaller than 80x24
- **THEN** the response or transcript and controls remain prioritized with a resize hint and playback/scoring are unaffected
### Requirement: Focused practice presentation
Recognition SHALL show all 42 supported response symbols at large size with a text caption and distinct listening, waiting, captured, unknown, replay, timeout and interruption states. Copying SHALL follow the transcript tail with a caret and withhold correctness until block completion.
#### Scenario: Captured answer
- **WHEN** a supported response is captured
- **THEN** it is immediately submitted for display and retained for 500 ms before feedback, which separately labels answer and expected symbol
### Requirement: Saved summary control
Saved summaries SHALL separate attempt/final accuracy, requested/delivered pace and adaptation reason and SHALL auto-continue after three seconds with Space hold/resume, Enter continue and Esc finish.
#### Scenario: Hold summary
- **WHEN** Space holds an already saved summary
- **THEN** the countdown freezes without compromising practice evidence
### Requirement: Inspectable progress
Progress SHALL show copying pace, attempt accuracy, recognition latency and a character grid with keyboard drilldowns, ranges of 30/100/all eligible blocks, actual points and honest empty/sparse states.
#### Scenario: Comparable history
- **WHEN** accuracy or latency is prepared
- **THEN** it defaults to the most recently observed eligible context, matches existing comparability rules and latency requires at least eight correct independent nonnegative samples
#### Scenario: Point details
- **WHEN** a graph point is selected
- **THEN** date, tested conditions, values, sample counts, repertoire changes and verified milestone conditions are available, while assisted/interrupted records remain separately labeled
