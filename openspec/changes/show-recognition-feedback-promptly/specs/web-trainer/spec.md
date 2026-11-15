## ADDED Requirements
### Requirement: Prompt recognition feedback
The browser SHALL use a sample-clock audio worklet and separate analysis worker,
render typed responses immediately, retain them for at least 500 ms including
feedback, and exclude interrupted evidence. Recognition feedback SHALL appear
once the captured response is accepted and current playback finishes, without a
fixed pre-feedback visibility delay.

#### Scenario: Accepted post-playback response
- **WHEN** the learner responds after recognition playback has finished
- **THEN** the expected answer appears as soon as the engine accepts the response and the learner's response remains visible beside it

#### Scenario: Early response or pending validation
- **WHEN** recognition playback is unfinished or the response has not yet been accepted
- **THEN** the expected symbol and pattern remain hidden and feedback does not close the trial prematurely

#### Scenario: Browser interruption
- **WHEN** audio is suspended or timing continuity is lost
- **THEN** practice stops or pauses with explicit interruption labeling rather than learner errors

#### Scenario: Recognition correction
- **WHEN** a response is disclosed and corrected
- **THEN** the answer readout and touch keyboard retain their position, feedback appears in a reserved inline area, and a correction remains readable for at least 1.2 seconds after corrective playback before the next sound
