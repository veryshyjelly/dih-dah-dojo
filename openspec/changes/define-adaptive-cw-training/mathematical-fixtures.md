# Mathematical fixtures for cw-policy-v1

These are golden examples and future executable acceptance cases, not claims that
the application exists. Unless stated otherwise, input timing permits every
otherwise valid alignment. Numeric comparisons use absolute tolerance 1e-8, apart
from explicitly rounded display examples.

## Numeric examples

| Input | Expected result |
| --- | --- |
| C=20,E=20 | d=.06, s=.06, character gap=.18, word gap=.42 seconds |
| C=20,E=10 | d=.06, s=.21789473684210525, PARIS duration=6 seconds |
| C=20,E=5 | d=.06, s=.5336842105263158, PARIS duration=12 seconds |
| E=10,T0=6,R=4,N=5 | adjusted E=6; throughput=30 characters/minute |
| target AB, attempts AXB, final AB | distances 1/0; accuracies .5/1 |
| target ABCDE, attempts ABDE | distance 1; accuracy .8; later DE can match |
| target AAA, attempts AA | distance 1; accuracy 2/3; omitted occurrence ambiguous |
| target AB, attempts XXXXAB | distance 4; clamped accuracy 0 |
| target AB, attempts AB | distance 0; accuracy 1 |
| empty target | unavailable score, not 0 or 1 |
| target A onset=1, attempt A at .5 | diagonal forbidden, distance 2, accuracy 0 |
| no accuracy observations | alpha=beta=1, mean=.5, L=.1,U=.9 |
| one correct observation aged 30 days | weight=.5, alpha=1.5,beta=1, mean=.6 |
| 30 same-instant correct observations | alpha=31,beta=1; L=.9284145445194744; still needs two dates |
| sorted latency values .1,.2,.3,.4,.5,.6,.7,.8 | Q(.5)=.4,Q(.9)=.8 |
| due review interval=1 day, fluent success | next interval=1.7 days |
| due review interval=1 day, slow correct | next interval=.5 days; accuracy remains correct |
| due review interval=10 minutes, failure | next interval stays 10 minutes |
| 20 recognition slots | quotas=8 weakness,5 review,4 uniform,3 introduction |
| F={7,8}, n=12 | backlog range [4,5] |
| b0=1 | rescue threshold B=4 |

## Structural and controller cases

- Enumerate all edit paths for short strings over a two-symbol alphabet, including
  empty inputs; compare optimal distances, per-target agreement, and edit-count
  ranges with the production scorer. Rejoining must not create cascading errors.
- For each sample boundary, cumulative rounding error is <= half a sample; the
  bound must not grow with the number of elements. Gaps replace rather than stack.
- Correct input before target onset earns no diagonal match; input during a
  character is retained with signed latency and does not interrupt its sound.
- A negative latency is preserved but absent from nonnegative percentile summaries.
- An extra unassigned attempt hurts aggregate accuracy without inventing confusion.
- Recompute evidence at the recorded evaluation instant; future observations must
  not affect earlier scores, live backlog, or decisions.
- Assistance and known failures cannot raise independent reliability. Aging alone
  does not append a failure or a regression observation.
- Two correct blocks in different material classes cannot be merged into one
  context's evidence window, but alternating classes do not erase each other's
  existing same-context upward qualification.
- Low-count blocks accumulate to >=20 symbols within at most three same-context
  blocks; score their combined distance/N, not an unweighted mean of accuracies.
- One bad eligible window below .8 lowers E by one; two qualified windows raise E
  by one. Hold decisions do not oscillate C or bypass bounds.
- At E=C, increasing character speed retains old E. At C=12,E=3, poor performance
  does not decrease either speed beyond the automatic bounds.
- Stable high backlog alone never rescues. Threshold, recent growth, corroborating
  inactivity/error evidence, and cooldown must all hold together.
- A missing three-second baseline cannot prove growth; fewer than ten attributable
  outcomes cannot activate the error branch.
- Rescue begins only at character end, adds 1–4 seconds, respects ten-second
  cooldown from the previous rescue end, and ends the block after its second use.
- A block with no printable input requires explicit resume before further audio.
- Controller streaks reset at session boundaries; historical check eligibility is
  recorded separately and can persist across sessions.
- Overrides do not overwrite automatic settings. Releasing one restores saved
  defaults and clears the corresponding streaks.
- An interrupted/assisted check cannot qualify. Same-day pairs and mismatched
  speeds/repertoire/class/policy versions cannot establish the repeated milestone.
- A text check passage is retired on presentation, including interrupted checks;
  exhaustion may offer a separately labeled group check.
- Freeze clocks, policy, selected material and numeric implementation for replay;
  scores, state transitions, and numeric decision reasons must reproduce.

## Scripted learner acceptance

| Script | Required observation |
| --- | --- |
| Accurate with delayed typing | latency/lag retained; stable lag alone does not rescue |
| Recurring substitutions | directed confusion only when attribution agrees and count threshold is met |
| Omit then rejoin | later correct characters remain creditable |
| Frequent corrections | attempt score differs from final score without a typo exemption |
| Temporarily increasing backlog and inactivity | bounded rescue then easier subsequent copying when repeated |
| No input | block remains bounded and further audio waits for explicit resume |
| Unreported external interruption | system does not pretend it can diagnose its cause from keystrokes |

Scripted learners test measurement and policy behavior, not learning efficacy.
