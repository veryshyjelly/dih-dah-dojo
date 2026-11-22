## ADDED Requirements
### Requirement: Clear word practice setup
The setup SHALL group pace, letter selection and round settings, use compact speed
inputs and provide a visually separate Start action. Data/history controls SHALL
remain secondary. All controls SHALL fit compact and wide layouts in both themes.
#### Scenario: Choose letters
- **WHEN** a learner selects a letter chip using keyboard or touch
- **THEN** its pressed state and selected count update without changing other round settings
- **AND** the selected count is visually prominent beside a smaller, muted alphabet total
#### Scenario: Clear or restore letters
- **WHEN** the learner clears letters or chooses all or introduced letters
- **THEN** the corresponding selection is reflected in alphabetical chips and Start is disabled while no letters are selected
### Requirement: Preserve word activity behavior
The redesigned setup SHALL preserve existing filters, playback, response modes,
assistance labels, history and guided-policy separation.
#### Scenario: Start a configured round
- **WHEN** the learner starts after choosing letters, length, vocabulary, response mode and pace
- **THEN** the existing word-selection and practice loop receives those choices unchanged
### Requirement: Consistent tool iconography
Words and Stories SHALL use the existing outlined icon family and circular tool
header badges. Setup sections, story cards, and key actions SHALL use consistent
icons without replacing accessible text labels.
#### Scenario: Navigate between tool pages
- **WHEN** the learner switches between Words, Stories and other tools
- **THEN** heading badges and action icons follow the shared visual style in both themes
