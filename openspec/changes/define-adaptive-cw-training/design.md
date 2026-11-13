# Mathematical design: CW policy v1 / v1.1

## Context

See [proposal.md](proposal.md) for the learner and product scope. This design fixes
scoring, statistical state, exercise selection, and adaptive control. The subsequently selected Rust/native low-latency architecture is recorded in
[engineering-design.md](engineering-design.md). Storage uses redb/Postcard (see docs/storage.md); the
mathematical core remains independent of runtime dependencies.

## Goals / Non-Goals

**Goals:** deterministic, inspectable decisions from sparse personal observations;
separate assistance, correction, uncertainty, and technical failure; define numeric
defaults and fixtures so the mathematical core can be implemented directly.

**Non-goals:** proving adaptive practice superior to fixed progression, diagnosing
cognitive recognition independently of typing, or fitting an individual forgetting
curve before sufficient data exists. Remaining engineering decisions are listed in
[open-questions.md](open-questions.md), not silently settled here.

All thresholds below are initial engineering defaults, not validated CW learning
constants. The baseline is `cw-policy-v1`; current sessions record `cw-policy-v1.1`. The
v1.1 extension below preserves v1 replay and prevents text-entry starvation. Later
policy changes create a new version rather than changing historical results.

## Decisions

### 1. Observation contract and deterministic evaluation

Input consists of the selected text, block type, character/effective speeds,
estimated audible character onsets `a_i` and ends `z_i`, scheduled final gap,
printable inputs with capture timestamps `t_j`, backspaces, pause/resume, failures,
answer disclosures, overrides, rescue intervals, and completion events. Preserve
raw values as well as normalized values. Character identities use the 42 supported
symbols: A–Z, 0–9, and `. , ? / = +`.

Use monotonic seconds inside a session and UTC instants for history. Store the
local date and timezone used for session/check decisions. Evidence aging uses
`max(0, evaluation_utc - observation_utc)` in days. Replay supplies the original
evaluation instant; it never consults the replay machine's current clock.

A decision consumes the history prefix available at that time. Order simultaneous
events by recorded sequence number. Store material choices and random draws or
selected outcomes; replay does not depend on a particular random generator.
Estimated audio delivery times are estimates, not verified sound-at-ear times.

### 2. Morse timing

Let `C` be character WPM and `E` be nominal effective WPM. Enforce `0 < E <= C`.

```
d = 1.2 / C                         # dot seconds
s = (60/E - 31*d) / 19              # Farnsworth spacing unit
```

Dot, dash, and intra-character gap durations are `d`, `3d`, `d` respectively.
Between characters use `3s`; between words use `7s` instead of `3s`. The 31 internal
and 19 spacing units are the PARIS convention, including the final word gap.
At `C=E`, `s=d`. Use the ITU character patterns and standard timing ratios:
[ITU-R M.1677-1](https://www.itu.int/dms_pubrec/itu-r/rec/m/R-REC-M.1677-1-200910-I!!PDF-E.pdf).
The v1 repertoire treats equals and plus as literal symbols, not explicit prosigns.

Schedule by rounding cumulative ideal boundaries to samples, not each individual
interval independently. For positive sample coordinates use `floor(value+0.5)`.
This bounds each boundary's rounding error by half a sample.

For scheduled duration `T0`, including the final gap, and added rescue silence `R`:

```
rescue_adjusted_effective_wpm = E * T0 / (T0 + R)
character_throughput_per_minute = 60*N / (T0 + R)
```

`N` excludes spaces. These describe transmission, not time spent correcting after
it. Do not label nominal PARIS WPM as literal natural-language words per minute.
Explicit pauses make a block ineligible for sustainable-speed assessment.
Recognition has character WPM and response timing, not continuous-copying E.

Defaults: `C=20`, copying `E=5`; automatic bounds `12<=C<=35`, `3<=E<=C`;
changes are one WPM. Overrides must still satisfy `0<E<=C`; engineering limits for
manual settings are deferred, not an authorization to accept invalid timing.

### 3. Copying score and edit attribution

Maintain an append-only **attempt stream** containing all accepted printable
characters, including later-erased attempts, and a **final transcript** affected
by backspace. Tail editing only: no arbitrary cursor editing during playback.
Backspace at an empty transcript has no text effect but remains an event.
Final-transcript characters retain the timestamps of their surviving insertions.

Normalize ASCII letters to uppercase. Unsupported printable input is visibly
rejected and is absent from scored streams. Preserve raw input for audit.
Whitespace is a separator, not a Morse character. For primary scores remove spaces
from target and response; for a secondary `text accuracy including spaces`, trim
outer spaces and collapse each whitespace run to one ASCII space before scoring.
The secondary score does not qualify a milestone or update character mastery.
Do not combine recognition timeout with copying insertion/deletion scoring.

For target `X` and response `Y`, compute unit-cost Levenshtein distance:

```
D(0,j)=j; D(i,0)=i
D(i,j)=min(
  D(i-1,j)+1,                      # target omission
  D(i,j-1)+1,                      # extra typed attempt
  D(i-1,j-1)+(X[i]!=Y[j])          # match or substitution
)
```

For non-space diagonal assignments, the response timestamp must be at least the
target's audible onset `a_i`; otherwise that diagonal is forbidden. Do not impose
a maximum copying lag. Spaces in the secondary score have no timing gate.

For `N>0`, `accuracy=max(0, 1-D(N,M)/N)`. An empty target has an unavailable score,
not 100%. Compute attempt and final-transcript scores separately. The UI name is
**attempt accuracy**; this replaces the earlier ambiguous term “first-pass”.
Corrections can add penalties, as explicitly accepted by the learner.

Retain all minimum-cost predecessor edges, not only one traceback. A target's
outcome is attributable only if every optimal path assigns that target the same
response index, or every path omits it. Agreement on character value alone is
insufficient for response latency. An ambiguous outcome updates no character
accuracy, confusion, or latency state. Aggregate distance remains usable.
Use forward and backward dynamic-programming costs to retain edges on optimal paths;
collect possible assignments per target without enumerating exponentially many full
paths. For edit-operation breakdowns report minimum/maximum counts over optimal paths
when counts differ. Do not interpret agreement as a calibrated probability of intent.

After the final scheduled gap allow a ten-second response tail, ending early on
Enter. It contributes to completion time but not transmission WPM. Inputs after
closure are not retroactively part of the block. Explicit interruption or known
input/audio failure compromises the block: retain it but exclude it from proficiency,
speed qualification, and milestones. A known recognition failure excludes the trial.

Examples without restrictive timestamp gates:

| Target | Attempts | Final | Attempt | Final accuracy |
| --- | --- | --- | --- | --- |
| AB | AXB | AB | 0.5 | 1.0 |
| ABCDE | ABDE | ABDE | 0.8 | 0.8 |
| AAA | AA | AA | 2/3 | 2/3 |
| AB | XXXXAB | AB | 0 | 1.0 |

For `AAA -> AA`, one omission is certain, but its occurrence is ambiguous. For
`AB -> AXB`, the extra X does not become a proven confusion of A or B.

### 4. Accuracy, latency, confusion, and retention state

Key accuracy states by `(symbol, mode, C, E, material_class, assistance)`.
Recognition omits E; classes are isolated characters, random groups, plain text.
Use exact speeds and separate assisted/independent states. No silent proficiency
transfer across modes, speeds, or material classes. Report unsupported contexts
as unknown. Retain at most the latest 100 eligible outcomes per state.

For binary correctness `u_k` and age `delta_k` in days:

```
w_k = 2^(-delta_k/30)
alpha = 1 + sum(w_k*u_k)
beta  = 1 + sum(w_k*(1-u_k))
p_hat = alpha/(alpha+beta)
L = BetaQuantile(0.1, alpha, beta)
U = BetaQuantile(0.9, alpha, beta)
```

With no observations the exact reference values are `p_hat=.5,L=.1,U=.9`.
Use inverse regularized incomplete beta evaluation accurate to absolute probability
error `1e-8`; record the numeric implementation version for replay reproducibility.
These are discounted evidence approximations, not guaranteed calibrated Bayesian
posteriors: trials are not independent identically distributed measurements.
Aging reduces evidence strength; it is not an observed failure or regression.

“Reliable under these conditions” requires `L>=.90`, `sum(w)>=30`, and independent
observations on at least two local dates. It is not permanent or whole-repertoire mastery.

Recognition uses its first answer. Explicit uncertainty and ordinary unanswered
trial timeout have `u=0`, with distinct raw labels. After disclosure a repetition
remains assisted until both 60 seconds and five intervening trials have passed.
Copying updates only attributable outcomes; a block with any rescue updates assisted
states only. Extra attempts remain in aggregate accuracy even when no target can
be blamed. Technical failures update neither assisted nor independent proficiency.

For a uniquely assigned correct independent response, latency is `ell=t_j-z_i`.
Retain negative values as early responses; exclude them from nonnegative latency
summaries. Store the latest 30 eligible nonnegative values per context. For sorted
values, use nearest-rank quantile `Q(q)=v[ceil(q*n)]`, one-based. Require eight values
before latency may support a difficulty increase. Initial response-fluency criterion:
`Q(.9)<=.8 seconds`. This is a typing-inclusive proxy, not cognitive diagnosis.

For each state, count attributable substitutions by response symbol using the same
100-outcome window and age weights. Conditional on a substitution, use a symmetric
Dirichlet prior of one on each of the other 41 symbols. Counts for omissions,
uncertainty, and timeout remain separate. Emphasize a directed confusion only after
three unweighted eligible substitutions of that pair; report assistance separately.

Retention is an explicit per-symbol review schedule, not a fitted forgetting model:

- On introduction set interval `I=1 day`, next due time `introduction+I`.
- A due independent isolated review, correct with nonnegative latency <=.8 seconds,
  sets `I'=min(90 days,1.7*I)`.
- A due wrong, uncertain, timed-out, slow, or early-response review sets
  `I'=max(10 minutes,I/2)`. Early responses are conservative timing-uncertain reviews,
  not proven recognition failures; their accuracy credit is retained.
- Set next due to `review_time+I'`. Early practice never postpones the due date.
- Compromised/assisted trials do not change the review schedule.

### 5. Material selection and entry assessment

A recognition block has at most 20 trials or 90 seconds. Allocate slots as
weakness 40%, due review 25%, uniform coverage 20%, introduction/recent material 15%.
Use largest-remainder allocation and resolve ties in that order. Allocation is for
20 slots; if time expires, unused slots are discarded. Interleave categories by
sampling from their remaining slot counts, recording each choice.

An empty category transfers its slots to uniform introduced material. Newly taught
symbols are eligible for sampling as assisted practice. At most one new symbol is
introduced per normal session. Define recent material as symbols introduced within
the last three sessions; other category eligibility uses current exact recognition C.

Within weakness category:

```
W(c)=.1+(1-p_hat(c))+(U(c)-L(c))+h(c)
```

`h` is weighted substitutions divided by weighted eligible outcomes at the current
recognition context; zero with no observations. Normalize weights over eligible
introduced symbols. Due-review weights are `1+min(3,overdue_duration/I)`.
Uniform coverage samples uniformly from introduced material. Avoid consecutive
identical symbols when at least two are eligible, renormalizing after exclusion;
this restriction does not apply in assessment.

A new symbol is eligible after two consecutive independent recognition blocks at
>=90% accuracy in the same C context. Reset the introduction streak after a speed
change or introduction. Select the unfamiliar symbol maximizing its minimum
unit-cost edit distance between dot/dash patterns and introduced patterns. Break
ties by A–Z, 0–9, then `. , ? / = +`. This is an initial separation heuristic, not
an empirically optimal curriculum. Teach by reveal/replay before scored attempts.

First-use assessment shuffles the 42 symbols without replacement and probes for at
most two minutes with four-second response windows. Do not start a trial after
that limit; finish any sounding character. Correctly recognized symbols become
introduced, not mastered. Explicitly unfamiliar symbols receive instruction before
any independent test. Continue remaining unobserved coverage in later sessions,
using introduction-category slots without exceeding the normal new-symbol limit.
If fewer than two symbols are recognized, teach enough of K then M to establish a
two-symbol practice set. This entry bootstrap is exempt from the normal one-new-symbol limit.
Use 500 ms of silence after an answered/timed-out recognition trial or replay before
starting the next; after teaching the learner continues explicitly with Enter.

Copying practice uses five-character groups and introduced material. Each draw uses
70% uniform sampling and 30% normalized weakness weights from the current copying
context. A missing context uses the reference prior. Permit repeated characters.
Do not insert unknown symbols merely to meet a quota.

After two consecutive independent random-group blocks at >=90% accuracy in the same
C,E context, plain text becomes available for that context. Alternate eligible
group and text blocks, groups first. Select uniformly among eligible records in a
bundled, versioned corpus whose symbols are all introduced; if none qualify, use
groups. Corpus acquisition/content is an engineering task, not invented here.

### 6. Mode and bounded speed controller

Normal copying blocks schedule at most 60 seconds, including required following
gaps; never start a character that will not fit. Recognition blocks stop starting
new trials after 90 seconds or 20 trials; finish any in-flight trial/replay.
Response timeouts start at audible character end; only the first supported answer
or explicit uncertainty closes the trial. An answer during sound may be recorded
but does not interrupt playback. Ignore subsequent answers until the next trial,
with a visible indication. No effective WPM is assigned to isolated trials.

Each normal session begins with recognition. Then:

- Recognition below 80% selects recognition; otherwise copying.
- Copying below 80% or with two rescues selects recognition; otherwise alternate.
- With at least two introduced symbols, at most two consecutive recognition blocks
  are allowed; this cap takes priority over the low-recognition-score rule.
- Compromised blocks do not change speed, streaks, or learning estimates; repeat the
  mode after the learner resolves the interruption.
- Start no new block after 600 elapsed session seconds (including pauses and review);
  allow the current block to finish. Stop early or explicitly continue at any time.

Copying controller decisions require >=20 transmitted non-space symbols. At lower
counts accumulate consecutive blocks in the same C,E/material context until >=20
symbols are available, at most three blocks, and evaluate them as one controller
window. Combine distances and N before computing accuracy, sum rescue counts, and
require every constituent block to meet non-score upward conditions. A context
change, interruption, or three-block window still below 20 discards that pending
window for controller purposes; character observations remain. This makes low-speed
practice evaluable without silently treating a tiny block as strong evidence.
Sample conservative backlog, defined below, at each completed character. Early
baseline is its median in the first ten seconds; end backlog is its median in the
last ten seconds. If either window has no samples the block cannot qualify upward.

An upward-qualified block has attempt accuracy >=95%, no rescue/interruption,
<=20% ambiguous target outcomes, and end backlog <= early baseline+1. The latest two eligible
blocks within a C,E/material-class context must both qualify to increase E by one;
intervening blocks in another material class do not reset that context streak. A
nonqualified eligible block in the same context resets it. Any eligible block below 80% or with two rescues
decreases E by one. One rescue alone prevents increase without forcing decrease.
Downward decisions take priority; a speed change resets streaks. Hold otherwise.

At E=C, two qualified blocks increase C by one while retaining old E. At E=3,
two consecutive eligible blocks below 70% reduce C by one while holding E=3.
At C=12,E=3 keep limits and return to recognition; normal mode-consecutive cap still
applies. Respect maximum C=35 without inventing further increments.

Recognition maintains separate C, initially 20, and timeout initially four seconds.
When the two-block introduction threshold and character-speed increase coincide,
introducing the session's one new symbol takes priority and retains current C.
This prevents repeated speed increases from continually resetting introduction
readiness before new material can be presented. Then apply these rules:

- Two consecutive independent blocks with >=95% accuracy and >=8 eligible latency
  values in the current context with Q(.9)<=.8 seconds increase C by one.
- Two consecutive independent blocks below 70% increase timeout by one second to
  maximum eight. Reset that streak after adjustment.
- When timeout already equals eight, two more below-70% blocks reduce C by one.
- Hold otherwise. Reset upward streak on a nonqualifying block, any adjustment,
  or a session boundary. Low-score streak also requires same C/timeout conditions.
- Accuracy denominator is completed, uncompromised first attempts, including
  uncertainty/timeouts; an empty block cannot qualify. Assisted trials do not
  enter independent block metrics or controller streaks.

All controller streaks are session-local. Two warm-up qualification blocks thus
cannot combine with a very old observation to trigger a new increase.

Overrides last only for the session and suspend automatic changes to overridden
dimensions. Releasing an override restores the saved automatic setting and clears
its streaks; overridden blocks do not train the automatic speed controller but do
supply appropriately tagged observations. Mode overrides suspend automatic mode
selection until released. Explain changes briefly between blocks with numeric reasons.

#### v1.1: text-transfer precedence

When two upward-qualified group windows at C,E would increase speed, first retain
that C,E if bundled practice text is eligible and fewer than two qualified text
windows exist there. This permits the already-specified text-entry gate to be
reached before a speed change invalidates it. Alternate group/text material as
usual; two qualified text windows can then advance speed. If no text is eligible,
normal group progression applies. v1 records retain their original transitions.

### 7. Live backlog and catch-up rescue

At each completed character align the current final transcript against all prefixes
of the completed transmission using the same distance and time gate. Let F be all
prefix endpoints minimizing `D(i,M)`. Define:

```
b_min=max(0,n-max(F))
b_max=max(0,n-min(F))
```

Recompute as text edits arrive; use character-completion samples for the controller.
A minimum prefix endpoint does not establish uniquely matched individual characters.
Use no future audio or later input in online decisions. Event-derived fields from
an offline full-block alignment must not leak into the live rescue calculation.

For the last three upward-qualified copying blocks at the same C,E/material class,
let b0 be the median of their individual median b_min values. Default b0=1 if none
exist. Set `B=max(4,ceil(b0+3))`. Rescue requires all of:

1. b_min>=B.
2. b_min has grown by >=2 since the last sample at/before three seconds ago.
3. No printable input for five seconds, OR at least three incorrect outcomes among
   the latest ten attributable outcomes from the current prefix alignment.
4. Ten seconds since the previous rescue ended, or no previous rescue.

If no three-second-old sample exists, growth is unproven. If fewer than ten
attributable outcomes exist, the error branch is unavailable. For “no input”, use
time since the most recent accepted printable input, or block start when none.
Re-evaluate on input and character boundaries. A request during sound waits until
that character ends. Once requested, it can be canceled before the boundary if
conditions cease to hold; it cannot shorten or distort a character.

The added quiet interval lasts at least one second and at most four. After the
minimum, end when b_min<=b0+1 has held continuously for 500 ms. During the gap,
recompute on edits with completed n unchanged. Ordinary scheduled gap and extra
rescue silence are separate; extra time is logged in R. No more than two rescues
per block. After the second interval, end audio, allow the response tail, and make
the next copying block easier. If the original block had <20 symbols, reduce E by
one explicitly as a rescue-recovery exception to the normal sample-count gate.

A block with no printable input requires explicit resume before any further audio.
Noisy attribution, intentional lag, interruption, and cognition are not reliably
identifiable from keystrokes alone: rescue is assistance, not a diagnosis.
Assessment blocks never invoke rescue.

### 8. Checks, sustainable speed, and trends

Offer an optional check only after >=3 completed practice sessions and two
upward-qualified group blocks at the current automatic C,E. Retain these check
eligibility records across sessions even though controller streaks reset.
Offer at most once per local date; persist the offered date, not only accepted dates.
A completed practice session contains at least one completed practice block.
Checks use a demonstrated qualified C,E (repeat a prior unmatched current-policy
check first, otherwise the highest qualified speed), frozen introduced repertoire,
and a fixed material
class. Start with random-group checks. Plain-text checks require qualified text
practice at that context. Do not offer a check during a speed override.

Group checks sample uniformly and allow within-exercise character repetition. Reject
exact exercise reuse from all earlier practice blocks and checks using normalized
exercise hashes; reserve a versioned corpus pool for plain-text checks so a
check passage has never appeared in practice. Retire a passage after presentation,
even if its check is incomplete. If text pool is exhausted, offer a separately
labeled group check, never treat it as the same assessment condition. Random groups
are unfamiliar sequences, not proof of unfamiliar semantic comprehension.

Schedule complete characters plus their following gaps that fit inside 180 seconds;
log unused remainder separately. Permit the ten-second tail. Milestone qualification
requires normal completion, no interruption/rescue/disclosure, and attempt accuracy
>=95%. Conditions key is `(C,E,repertoire,material_class,scoring_policy_version)`;
record corpus version for text. Two qualifying checks on different stored local
dates with identical conditions establish that milestone. Corpus version must also
match for a text pair. Always display speed and tested repertoire: a two-symbol
result cannot establish alphabet fluency. No minimum qualifying WPM has been agreed.

Compare trend scores only for matching context and policy version, using the latest
three versus preceding three eligible independent blocks. Report their mean-score
difference as a numeric trend, not a causal learning claim. Fewer than six means
insufficient comparable history. Character latency and confusion trends retain
separate coverage counts; low-confidence summaries are not regression labels.

## Risks / Trade-offs

- Exact-context states are sparse -> expose uncertainty, retain coverage practice,
  and avoid extrapolating a high-speed claim from slow practice.
- Unit edit distance cannot identify intention -> preserve all-optimal-path ambiguity
  and use separate aggregate and character-level evidence.
- Attempt scoring penalizes corrections -> display final-transcript score alongside
  it; retain this user-approved metric rather than inferring which edits were typos.
- Raw ability is confounded by typing and audio delay -> label timing as a response
  proxy, record technical compromise, and measure platform behavior before release.
- Discounted Beta intervals are approximate -> label them model uncertainty and
  validate forecasts later; do not advertise scientifically calibrated mastery.
- Review intervals and selection weights are provisional -> version them and evaluate
  retention/transfer rather than treating short-term score increases as success.
- Short blocks can be too small at low E -> aggregate bounded same-context windows
  to reach 20 symbols, without lowering the evidence threshold.

## Migration Plan

This repository has no application history to migrate. Update the proposal and
specs to replace ambiguous “first-pass” copying language with attempt accuracy.
Keep the change unarchived until implementation and verification actually exist.
Future policy changes retain original observations and original-version results;
recomputed estimates must be labeled with their new policy version.

## Open Questions

Only engineering acceptance, implementation architecture, persistence details, and
corpus content remain in [open-questions.md](open-questions.md). Tasks contain a
readiness gate for these decisions. OpenSpec artifact completeness is not permission
to bypass that gate or evidence that the application has been implemented.

## Implemented reporting clarification

Comparable trends also require identical repertoire and text-corpus version. A
latency trend compares the means of the latest three versus preceding three
comparable block medians, with at least eight correct independent nonnegative
responses in each block. Display the signed millisecond change and typing/delivery
limits; do not call it a causal change in cognitive recognition speed.

A completed first placement sets entry completion even if its two-minute budget
leaves unobserved symbols. Those symbols remain eligible for normal taught
introductions rather than restarting placement on every session. Interrupted first
placement can resume unobserved coverage later.
