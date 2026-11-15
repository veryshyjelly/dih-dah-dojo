## Decision
Remove the browser coordinator's 500 ms pre-feedback timer. Close a recognition
trial as soon as both its audio completion and engine acceptance are available.
Keep an explicit pending-answer guard so audio finishing while acceptance is in
flight cannot disclose unvalidated feedback. Ignore answer acknowledgements from
a prior epoch after pause or finish.

The typed response stays visible through the existing feedback phase: at least
one second for correct answers and 1.2 seconds after corrective playback for
incorrect ones. The visibility requirement is met without delaying disclosure.
No expected symbol or pattern is shown while the trial sound is still playing.

## Validation
Use the actual Rust worker/audio worklet in browser tests. Measure feedback latency
after a post-playback keypress; check early responses remain undisclosed until
playback completes and a delayed worker acknowledgement cannot close early.
Retest pause/help, answer visibility and correction playback across Chromium,
WebKit and mobile. Keep the physical timing gate open.
