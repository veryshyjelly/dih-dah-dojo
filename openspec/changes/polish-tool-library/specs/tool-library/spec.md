## ADDED Requirements
### Requirement: Predictable initial tool selection
Tools SHALL select its first option, Word training, on initial entry.
#### Scenario: Open Tools
- **WHEN** a visitor opens Tools
- **THEN** Word training is selected and its configuration is visible
### Requirement: Browsable story library
The library SHALL prioritize story titles, short descriptions, duration and word
counts, with compact speed controls and clearly actionable cards. Character details
SHALL remain collapsed until requested. Existing saved progress SHALL be visible
without exposing unrevealed transmission text.
#### Scenario: Inspect character coverage
- **WHEN** the learner opens a card's character guide
- **THEN** coverage details appear without selecting or playing the story
#### Scenario: Compact or dark presentation
- **WHEN** the library is viewed at 320px or desktop width in either theme
- **THEN** cards, controls and disclosures fit the viewport and remain keyboard accessible
### Requirement: Bookmark-aware story activation
The story library SHALL wait for saved activity to load before allowing a story to
be selected and SHALL indicate pending saves distinctly from completed saves.
#### Scenario: Select a story immediately after reload
- **WHEN** a learner enters Stories while saved activity is loading
- **THEN** selection waits until the bookmark is available rather than starting at the first sentence
