## ADDED Requirements
### Requirement: Contextual language sign-in invitation
Words setup, the story library and both language progress tabs SHALL show guests an in-page sign-in invitation explaining account synchronization across devices. The invitation SHALL use the existing sign-in dialog and SHALL state that guest history stays local without automatic account import.
#### Scenario: Guest requests sign-in
- **WHEN** a guest activates the in-page sign-in action
- **THEN** the existing provider dialog opens and can be dismissed without losing the current destination or setup
### Requirement: Focused authenticated practice
The invitation SHALL be absent for signed-in learners and during active language practice. Guest exploration and guest-local progress SHALL remain available.
#### Scenario: Practice or signed-in view
- **WHEN** a learner starts a language activity or is signed in
- **THEN** the contextual sign-in panel does not interrupt the experience
### Requirement: Responsive invitation
The invitation SHALL match the current visual style and remain keyboard accessible in both themes at compact and desktop widths.
#### Scenario: Compact guest view
- **WHEN** a guest opens either setup or language progress at 320px
- **THEN** the explanation and sign-in action fit the viewport without horizontal overflow
