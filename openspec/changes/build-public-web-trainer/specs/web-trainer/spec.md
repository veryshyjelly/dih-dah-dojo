## ADDED Requirements
### Requirement: Public receiving studio
The website SHALL provide public listening tools and a short demo, Google/GitHub accounts, guided adaptive practice, synced progress and responsive mobile input using Monaspace typography.
#### Scenario: Anonymous visitor
- **WHEN** a visitor opens the website without signing in
- **THEN** tools and the demo work without account creation and guided progress requires sign-in
### Requirement: Shared policy and isolated input profiles
Native and browser engines SHALL share cw-policy-v1.2 and preserve native binary records while keyboard/touch and guided/tool evidence remain separately labeled.
#### Scenario: Manual drill
- **WHEN** a learner configures a manual exercise
- **THEN** its results do not establish adaptive milestones or silently change automatic targets
### Requirement: Independent audio and capture
The browser SHALL use a sample-clock audio worklet and separate analysis worker, preserve immediate answers and 500 ms visibility, and exclude interrupted evidence.
#### Scenario: Browser interruption
- **WHEN** audio is suspended or timing continuity is lost
- **THEN** practice stops or pauses with explicit interruption labeling rather than learner errors
#### Scenario: Recognition correction
- **WHEN** a response is disclosed and corrected
- **THEN** the answer readout and touch keyboard retain their position, feedback appears in a reserved inline area, and a correction remains readable for at least 1.2 seconds after corrective playback before the next sound
### Requirement: Durable owner-scoped synchronization
The API SHALL authenticate ownership, persist versioned binary events/checkpoints atomically, deduplicate block IDs and protect newer revisions from stale uploads.
#### Scenario: Lost acknowledgement
- **WHEN** an upload is retried after its response is lost
- **THEN** the stored block is returned without a second progression update
### Requirement: Free frontend and isolated Termux origin
Cloudflare SHALL serve static assets while the Termux API is exposed through the existing tunnel without disturbing other services, with consistent backups and restart supervision.
#### Scenario: Phone outage
- **WHEN** the API origin is unavailable
- **THEN** public tools and demo remain usable and pending signed-in results remain locally retained with honest sync status
