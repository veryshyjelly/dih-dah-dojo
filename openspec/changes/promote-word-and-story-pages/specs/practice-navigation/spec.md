## ADDED Requirements

### Requirement: First-class language practice destinations
The website SHALL expose Words at `/words` and Stories at `/stories` in the main
navigation, ordered The studio, Practice, Words, Stories, Tools, Your progress.
Each destination SHALL have an accessible page name of Word training or Story
listening and a visible, accessible current-page indication.

#### Scenario: Direct entry and reload
- **WHEN** a visitor opens or reloads `/words` or `/stories`
- **THEN** the corresponding experience is displayed and its main navigation item is active
- **AND** the toolbox sidebar and toolbox introduction are absent

#### Scenario: Browser history
- **WHEN** a visitor navigates among the destinations and uses Back or Forward
- **THEN** the URL, displayed experience and active navigation item agree

### Requirement: Discoverable studio entry points
The studio SHALL offer three feature cards in order: Practice, Word training and
Story listening, linking to their respective destinations. It SHALL retain the
existing primary guided-practice action and secondary Explore the tools link.

#### Scenario: Choose a practice experience
- **WHEN** a visitor activates a studio feature card
- **THEN** its corresponding Practice, Words or Stories page opens directly

### Requirement: Consistent standalone presentation
Words and Stories SHALL retain their existing outlined icon badges, controls,
save status, history and polished setup/library presentation within standalone
page panels. Both themes SHALL remain usable at compact and desktop widths.

#### Scenario: Inspect standalone pages
- **WHEN** the learner opens either page in light or dark mode
- **THEN** its matching icon badge and existing controls are visible without a duplicate oversized page heading
- **AND** story character guides remain optional and undisclosed transmission text remains hidden

### Requirement: Responsive main navigation
Main navigation SHALL remain in one row on desktop and use a separate,
horizontally scrollable row below the brand/actions at widths of 1100px or less.
It SHALL preserve visible focus, targets at least 44px high, and active-item
visibility without causing document-level horizontal overflow.

#### Scenario: Navigate on a narrow screen
- **WHEN** a visitor uses the navigation at 320px or 780px width with touch or keyboard
- **THEN** every destination remains reachable and the active destination is visible
- **AND** content below the header is not overlapped by the navigation row

### Requirement: Navigation preserves practice integrity
Switching destinations SHALL stop outgoing playback, remove outgoing listeners
and invalidate pending playback callbacks. Mode/account changes SHALL isolate
component state while preserving existing interruption and persistence semantics.

#### Scenario: Leave during playback
- **WHEN** a learner leaves Words, Stories or guided Practice during playback using navigation or browser history
- **THEN** outgoing audio stops and late callbacks do not advance or save an abandoned activity
- **AND** navigation does not fabricate a completed result

### Requirement: Existing access and evidence boundaries
Words and Stories SHALL remain available to guests with local storage and to
signed-in learners with account-isolated sync. Existing saved history and story
bookmarks SHALL remain compatible. Their activity SHALL remain separate from
guided progression and verified milestones.

#### Scenario: Restore existing activity
- **WHEN** a learner enters either new route with saved activity
- **THEN** existing history remains available to its owner
- **AND** story activation waits for bookmark loading and resumes according to existing bookmark behavior

#### Scenario: Guest or account change
- **WHEN** a guest uses the new destinations or the signed-in account changes
- **THEN** existing guest-local and account-isolation rules are preserved without silently transferring history
