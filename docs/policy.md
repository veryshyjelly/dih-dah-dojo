# Practice selection and bounded control

`planner.rs` and `control.rs` implement the pure selection/control portion of
cw-policy-v1.1 (the v1 mathematical core plus text-transfer precedence). They do not perform device I/O or persist data themselves.

Recognition uses 20 slots: eight weakness, five due review, four coverage, three
introduction/recent-symbol slots. Empty categories transfer to coverage. Category
interleaving and weighted draws are seeded; selected material is also stored so
replay does not depend on a random generator. Adjacent identical symbols are avoided
when an alternative exists. A ready new symbol is guaranteed a teaching occurrence.

New material requires two accurate recognition blocks, is limited to one symbol per
session, and uses pattern separation with deterministic repertoire-order ties.
Introduction takes priority when the same evidence would otherwise raise character
speed and erase introduction readiness. Until then, fast responses can increase
character speed; low accuracy first widens the recognition response window.

Copying uses five-character groups with 70% uniform / 30% weakness-weighted draws,
or eligible bundled text. `assets/corpus.tsv` contains original CC0 text with
separate practice/check pools and versioned IDs. Text checks never select a seen
assessment passage. Pool exhaustion falls back to explicitly labeled group checks.
Complete-character prefixes include their final gap and fit the selected duration.

Copying changes effective speed one WPM at a time after qualifying evidence.
Low-count blocks accumulate across at most three same-context copying blocks.
Aggregate accuracy uses total edit distance / total transmitted symbols, not a mean
of percentages. Material classes keep separate upward streaks; a speed change
clears streaks. Rescues prevent increases, repeated rescues reduce pace, and all
speed/timeout floors and ceilings remain explicit. Manual overrides do not overwrite
saved automatic defaults.

`scoring::live_alignment` uses only completed audio and captured input, aligning the
editable transcript to transmitted prefixes. It returns conservative backlog bounds
and a recent error count only when enough outcomes can be attributed. Stable lag
alone is insufficient to trigger rescue. Threshold, growth, inactivity/error
corroboration, freshness, and cooldown must hold together. The transport must still
enforce rescue timing and character boundaries; the pure tracker cannot establish
physical delivery behavior by itself.

Tests cover quotas, empty categories, corpus validity/disjoint pools, deterministic
selection, complete-character duration, text exhaustion, speed/timeout bounds,
alternating material classes, small-window accumulation, introduction priority,
overrides, omission/rejoining, stable lag, stale evidence, and rescue cooldown.

## Versioned progression clarification

Policy v1.1 holds a qualified group speed while eligible text still needs two
qualified windows at that same speed. Otherwise increasing E immediately would
invalidate the text-entry gate forever. If no bundled text fits the introduced
repertoire, group practice can progress normally. The existing one-new-symbol
priority similarly prevents recognition speed changes from starving introductions.

Record schema 2 stores the policy string. v1 records continue to replay their
original controller transitions; v1.1 uses the text-transfer precedence. Statistics
and score semantics are unchanged. Checks are paired only within one stored policy
version. Optional checks use a demonstrated qualifying speed, rather than the
unproven one-WPM increase scheduled for the next practice block.
