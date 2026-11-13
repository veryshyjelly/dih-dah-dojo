# Adaptive CW fluency training

## Why

The first learner has encountered letters and some punctuation but needs fluent recognition and sustained typed copying. Practice should discover current ability and choose productive next steps, while distinguishing real retention and transfer from repetition, assistance, and typing effects.

## What Changes

- Define product behavior for approximately ten-minute, automatically mixed recognition and copying sessions.
- Specify assessment, reveal-and-replay recognition feedback, correction-aware copying, and bounded catch-up rescue.
- Define spacing-first adaptation, separate mode proficiency, retention review, explanations, and manual overrides.
- Establish optional unfamiliar-material checks and a repeated three-minute, 95% attempt milestone at a recorded steady speed.
- Specify local offline history, export/reset, keyboard control, audio readiness, and interruption handling.
- Specify cw-policy-v1: timing equations, correction-aware alignment, discounted evidence, review intervals, material sampling, mode/speed control, rescue, and assessments.
- Add mathematical fixtures and verified-by-task implementation work; retain an explicit engineering-readiness gate.

## Capabilities

### New Capabilities
- `entry-assessment`: Discover current ability without assuming a fixed starting lesson.
- `recognition-practice`: Develop independent sound-to-character recognition and distinguish assisted practice.
- `continuous-copying`: Support ongoing typed reception, corrections, rejoining, and automatic rescue.
- `adaptive-progression`: Personalize material, mode, and speed while retaining uncertainty and review.
- `progress-assessment`: Measure transferable progress without confusing assistance or familiarity with fluency.
- `session-experience`: Provide minimal-configuration keyboard practice with reliable playback and interruption handling.
- `local-history`: Retain one learner’s progress locally with export and reset controls.

- `morse-timing`: Generate precise character timing and account for Farnsworth spacing and rescue.

- `copy-scoring`: Define attempt and final scores without inventing character attribution.

- `learner-estimation`: Keep context-specific evidence, timing, confusion, and explicit retention reviews.

- `training-policy`: Apply the versioned sampling, controller, rescue, and assessment decisions.

- `realtime-execution`: Isolate sample-clock audio and timestamped input from rendering, learning computation, and storage.

### Modified Capabilities

None; the repository has no existing product specifications.

## Impact

The requirements and mathematical artifacts guide ongoing implementation. The mathematical policy and implementation checklist are now specified in `design.md` and `tasks.md`. Rust 2024 and a native low-latency architecture are selected in `engineering-design.md`: CPAL/CoreAudio, preallocated rtrb queues, and separate input, rendering, analysis, and history execution. Storage now uses crash-tested redb/Postcard transactions; statrs is selected for numerical estimates. Application coding remains gated on the engineering decisions in `open-questions.md`.

## Scope and non-goals

The first release serves one learner offline in a local macOS terminal. Supported symbols are A–Z, 0–9, and `. , ? / = +`; copying progresses from groups to short plain text. Sending, head-copy assessment, radio-conversation training, explicit prosigns, multiple profiles, synchronization, other platforms, and remote-terminal audio are outside this release.

The long-term aim is more effective learning than fixed progression. Adaptive behavior alone does not establish that claim; it requires a later comparative evaluation at comparable practice time.
