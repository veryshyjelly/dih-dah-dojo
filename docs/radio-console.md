# Radio console

Run `cargo run --release --locked -- train` in a native terminal. The complete
layout fits 80×24; 110×30 adds wider instrument panels. Smaller windows keep the
response or transcript tail visible and request a resize. Resizing does not alter
playback or scoring. No special font is required.

The idle sections are **1 Dashboard, 2 Practice, 3 Progress, 4 Audio**. F1 also opens
Progress. Tab/Shift-Tab and arrows move selection; Enter activates. `?` opens help
on idle or paused screens. Dashboard's primary action continues training; the
Practice launcher defaults to Adaptive, with Recognition and Copying available.
Export and reset are secondary Dashboard data actions. Reset still requires typing
`DELETE` and pressing Enter; Esc cancels.

During practice, digits and punctuation are responses. F5 pauses, F6 requests a
recognition replay, Esc finishes, and Ctrl-C quits. Recognition shows the first
accepted response immediately and holds it for 500 ms before disclosure or the
next trial. Feedback labels the learner's answer separately from the expected
symbol. Copying follows the transcript tail and caret; Backspace edits only that
tail. Correctness appears after saving the block.

Saved block summaries distinguish attempt/final accuracy, requested/delivered
pace, and the adaptation reason. They continue after three seconds. Space holds or
resumes the remaining countdown, Enter continues immediately, and Esc finishes.
Holding a saved summary does not mark the block interrupted.

Audio settings show volume and frequency gauges. Left/Right adjusts the selected
field and automatically previews the latest settings after rapid changes settle.
Space/F6 replays. Leaving stops the preview and saves preferences. Previews do not
produce practice observations.

Progress opens with three graph cards and a character grid. Tab/arrows selects a
card; Enter expands it. Left/Right selects a point, character, or history record;
Up/Down scrolls details. Esc collapses or returns. `R` cycles latest 30, latest 100,
and all eligible blocks. Each graph applies its own eligibility rules before the
range limit; histories keep assisted and interrupted results explicitly labeled.

- Copying pace plots requested C and E separately. Verified markers require the
  existing qualifying checks at matching conditions on different dates. Point
  details include delivered pace, repertoire changes and tested conditions.
- Attempt accuracy selects the most recently observed eligible practice context,
  matching speed, mode, material, repertoire, policy and corpus version.
- Recognition latency uses a comparable observed context with at least eight
  correct independent nonnegative samples per block. Median and p90 include typing.

Points are not extrapolated or smoothed. Descriptive accuracy/latency trends still
need six comparable blocks. Character reliability uses the existing learner-model
evidence rules; introduced coverage is not a mastery claim. Graphs are prepared on
entry/range changes and shared with the renderer, rather than rebuilt every frame.
Selection and countdown state are not persisted in the learner profile.

Set `NO_COLOR=1` to remove colors. Use `train --plain` for ASCII presentation without
decorative motion. These options can be combined. “Timing estimated” refers to
software clock mapping; physical audio, key and display timing remain unverified.
See [console verification](console-verification.md) for measured software behavior.
