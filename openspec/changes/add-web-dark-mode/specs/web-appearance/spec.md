## ADDED Requirements
### Requirement: Persistent studio appearance
The website SHALL provide light and dark themes, resolve its theme before first paint, follow the device theme until manually overridden, and preserve a manual preference across navigation and reloads when browser storage is available.
#### Scenario: First visit in dark mode
- **WHEN** a new visitor's device prefers dark mode
- **THEN** the studio initially uses dark surfaces, readable text and matching native controls
#### Scenario: Manual preference
- **WHEN** a visitor chooses the other theme
- **THEN** the theme changes without navigation and stays selected after a reload, including when the device prefers the opposite theme
#### Scenario: Storage unavailable
- **WHEN** browser storage is unavailable
- **THEN** the visitor can still change theme for the current page without an error
### Requirement: Practice independence
Theme selection SHALL change only presentation, without pausing, restarting or altering practice audio, responses, deadlines, scoring or history.
#### Scenario: Active recognition
- **WHEN** a learner changes theme while waiting for a recognition response
- **THEN** the active exercise continues and a subsequent Morse response is captured normally
### Requirement: Public source access
The footer SHALL link to the published public GitHub source repository and the creator's portfolio at https://veryshyjelly.in, and the repository SHALL identify the live website as its homepage.
#### Scenario: Source link
- **WHEN** a visitor activates the footer GitHub link
- **THEN** the public repository opens separately without replacing an active exercise
#### Scenario: Portfolio link
- **WHEN** a visitor activates the footer Portfolio link
- **THEN** https://veryshyjelly.in opens separately without replacing an active exercise
