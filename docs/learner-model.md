# Learner evidence and deterministic records

`learner.rs` implements cw-policy-v1's statistical core using statrs 0.19.1.
Each symbol has separate recognition/copying, exact speed, material, and assistance
contexts. Retain at most 100 observations per context; weight evidence with a
30-day half-life. The Beta(1,1) reference prior is updated by weighted successes and
failures. Report mean and 10th/90th percentiles as approximate model uncertainty,
not scientifically calibrated mastery probabilities.

Reliability requires a lower bound of 0.90, effective evidence of 30, independent
observations on two dates, and an unassisted context. A new speed is unknown rather
than silently inheriting mastery from easier practice. Aging weakens evidence; it
never records an unobserved failure.

Latency summaries use the latest 30 correct independent nonnegative delays and
nearest-rank quantiles. Early answers retain their signed latency but are excluded
from those summaries. These are typing-inclusive response measures. Directed
confusions use a conditional Dirichlet prior across the other 41 symbols; omissions
and uncertainty are not fabricated substitutions.

Due reviews start at one day, grow by 1.7 after a due independent correct response
within 0–800 ms, and otherwise halve to a ten-minute minimum. Intervals cap at
90 days. Early or assisted practice never postpones a due review. Correct but slow
responses retain accuracy credit even when their next review is earlier.

`recording.rs` defines schema-v2 binary block records: policy and clock context,
source events, delivery estimates, trial results, assistance/interruption status,
conditions, and derived evidence. `derive` computes evidence from source inputs;
`replay` recomputes metrics, observations, review updates, controller transitions, and decision text from stored boundary snapshots, and rejects mismatches instead of
quietly changing historical scores. Existing observed events remain authoritative.
The storage transaction commits record and profile together.

Automated fixtures verify the prior, half-life, Beta(31,1) lower quantile,
72 inverse-CDF/CDF checks against the 1e-8 probability tolerance, context isolation,
window caps, latency quantiles, confusions, review boundaries, binary profile/record
round trips, correction-aware replay, and interrupted/assisted check exclusion.
Full policy scheduling and trainer integration are subsequent modules; the model
alone does not constitute a working adaptive session.
