## ADDED Requirements
### Requirement: Readable help guide
Help SHALL use a short title, grouped shortcut rows and concise practice instructions, with detailed progress, timing and data explanations available through disclosures.
#### Scenario: Help on a short or narrow screen
- **WHEN** help is opened at a small viewport or its details are expanded
- **THEN** the dialog stays within the viewport, only its body scrolls, and its close control and footer remain available
### Requirement: Isolated help interaction
Help SHALL pause active practice through the existing pause control, hold an unheld saved summary, and prevent dialog keys from becoming Morse responses or practice commands.
#### Scenario: Closing help during practice
- **WHEN** help is opened during recognition and dismissed with Escape
- **THEN** only help closes, practice remains paused, and the learner can explicitly resume normally
#### Scenario: Reading help after a saved block
- **WHEN** help is opened during a saved-summary countdown
- **THEN** the countdown is held without changing the saved evidence and remains held when help closes
