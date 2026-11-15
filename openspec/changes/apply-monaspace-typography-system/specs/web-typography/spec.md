## ADDED Requirements

### Requirement: Consistent expressive typography
The studio SHALL use Neon for everyday UI and literal responses, Argon for main
headings, Krypton for instruments, Xenon for selected explanatory prose and Radon
for brief selected coaching notes. Families SHALL follow semantic roles across
pages and both themes.

#### Scenario: Open a practice launcher
- **WHEN** a learner opens a practice page
- **THEN** its heading, instruments and explanatory prose use their assigned roles
- **AND** controls remain readable and usable at compact and desktop widths

### Requirement: Literal practice presentation
Typed responses, expected Morse text, callsigns, prosign tokens and transcripts
SHALL retain a neutral literal face without coding/contextual ligatures. Font
loading SHALL NOT restart, pause or alter practice or persisted progress.

#### Scenario: Type a Morse response
- **WHEN** a learner enters a response while fonts are loading or cached
- **THEN** its literal characters and punctuation remain individually recognizable
- **AND** the existing input, playback, scoring and disclosure behavior is retained

### Requirement: Bounded self-hosted font delivery
Fonts SHALL be pinned, self-hosted official assets with preserved license and
versioned cache URLs. Only the critical body face SHALL be preloaded, and accent
faces SHALL use the cuts needed for their role rather than whole variable families.

#### Scenario: Load the studio
- **WHEN** the browser loads the website
- **THEN** font resources come from the studio origin and do not block visible text
- **AND** the existing script security policy remains intact
