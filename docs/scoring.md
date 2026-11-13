# Copying scores

The mathematical copying scorer is implemented as a pure Rust worker-thread module.
It does not update learner proficiency or perform audio delivery calibration.

## Inspect a score without audio or a TTY

```sh
cargo run --locked -- score ABCDE ABDE
cargo run --locked -- score AB 'AX\bB'
cargo run --locked -- score AAA AA
cargo run --locked -- score 'A B' AB
```

The second command interprets literal `\b` as a tail Backspace. Actual ASCII
Backspace/Delete control characters are also accepted. Other backslash escapes
are rejected. Shell-quote text containing spaces or escape sequences.

For target `AB` and edits `AX\bB`, attempts remain `AXB` (50% attempt accuracy),
while the final transcript becomes `AB` (100% final accuracy). Every accepted
printable attempt remains evidence; no hidden “quick typo” exemption is applied.

A missing C in `ABCDE -> ABDE` costs one error and does not invalidate the later
DE. For `AAA -> AA`, the score identifies one omission but cannot identify its
occurrence: each target position is reported as ambiguous. Ambiguity also applies
when the character value is certain but the response index differs across optimal
alignments; a latency cannot be attached to an arbitrarily selected response.

Primary accuracy removes spaces. A separate text score trims outer whitespace,
collapses whitespace runs, and includes spaces in edit distance. For `A B -> AB`,
primary accuracy is 100% and text accuracy 66.67%. Neither is a word-boundary F1 score.

Scores are `max(0,1-edit_distance/target_length)`; an empty target has unavailable
accuracy. Edit-operation counts are marginal min/max ranges across optimal paths;
the minima of all three categories need not describe one jointly possible path.

## Timestamped library use

`transcript::Transcript` records edits, raw character values, monotonic nanosecond
capture times, and acceptance. It exposes append-only attempts and surviving final
symbols, retaining each survivor's insertion timestamp. Unsupported input and paste
are recorded as rejected, never as Morse responses. Timestamp reversal and more
than 16,384 events return explicit errors without partially applying the event.

`scoring::score_copy` accepts target onset symbols and response symbols relative to
the same monotonic origin. A match/substitution diagonal is forbidden when a response
predates its target onset. `scoring::align` exposes either primary or space-inclusive
scoring. Returned target/response indices refer to original slices, including spaces
removed during normalization. The CLI uses zero timestamps and labels its results
**untimed**; they cannot establish sustainable speed or train proficiency.

Dynamic programming computes exact distance and operation-count ranges. A reverse
traversal of every optimal predecessor edge determines per-target agreement without
enumerating exponentially many full alignments. Computation stays off audio/input
threads. The scorer limits inputs to 16,384 symbols each and the matrix to 4,194,304
cells (16 MiB of cost entries, plus traversal/normalization/range memory). Oversized
comparisons return an error; callers must not report a partial or falsely perfect
score. Normalization rejects unsupported target/response symbols and reversed times.

## Verification

Run `cargo test --locked`. Golden examples cover corrections, omissions, excess
input, whitespace, premature responses, empty targets, and resource limits. An
independent exhaustive enumerator compares distance, attribution, and marginal edit
ranges for all 1,922 pairs of binary strings of length zero through four, both
untimed and with staggered onset/response timestamps. CLI tests execute the documented
examples without a terminal or audio device.

Live probe input is not yet connected to this scorer: its audio-to-input clock
mapping, response tail, and interruption status must be established before treating
playback results as scored training evidence.
