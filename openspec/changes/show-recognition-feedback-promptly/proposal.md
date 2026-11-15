## Why
Recognition currently waits an extra 500 ms after capture before showing the
expected answer, even when the sound has already finished. This feels unresponsive.

## What Changes
- Show recognition feedback once the response is accepted and playback finishes.
- Keep the learner's response visible alongside feedback and preserve the existing
  correction playback and feedback reading time.
- Preserve capture timestamps, scoring, deadlines, interruption handling and the
  physical timing gate.

## Impact
Browser presentation only; no Rust policy, audio scheduling, storage or API changes.
