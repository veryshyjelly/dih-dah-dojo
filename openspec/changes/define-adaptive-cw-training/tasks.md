# Implementation tasks

These tasks track the implementation and its evidence, not artifact existence.
Software implementation is complete under cw-policy-v1.1 with legacy-v1 replay.
Physical verification in 1.2 and part of 8.1 remains open; unverified-route practice
is explicitly labeled. Reference: [design](design.md),
[verification](../../../docs/session-verification.md), and the Rust tests.

## 1. Engineering readiness gate

- [x] 1.1 Record Rust language choice, module boundaries, execution ownership and event interfaces in engineering-design.md; verify callback/input isolation, bounded fault behavior, and mathematical-policy compatibility.
- [ ] 1.2 Establish and measure audio timing, delivery timestamp, input capture, stop/pause, and responsiveness tolerances on the target Mac; verify a documented loopback/input measurement protocol and explicit limits on sound-at-ear claims.
- [x] 1.3 Define history durability, export format, reset scope, recovery, and version migration; verify crash/partial-write and reset acceptance scenarios are specified before selecting storage implementation.
- [x] 1.4 Select or author a licensed, versioned offline text corpus with disjoint practice/check pools; verify repertoire validation, unique record identities, eligibility filtering, and exhaustion behavior.

- [x] 1.5 Select and pin numerical/dependency releases in Cargo.lock; verify CPAL API/timestamp compatibility, Beta quantile tolerance, and build the Rust audio/input spike against the recorded architecture.

- [x] 1.6 Build the Rust audio/input spike with pinned CPAL/rtrb/Crossterm, callback diagnostics, and a dedicated terminal reader; verify native short playback, concurrent typing/backspace/stop, no-allocation sample rendering, and document limitations in docs/prototype-verification.md.

## 2. Events and Morse timing

- [x] 2.1 Implement versioned raw observation and decision records with monotonic sequence ordering and stored evaluation/date context; verify equal-timestamp ordering and fixed-clock replay fixtures.
- [x] 2.2 Implement ITU repertoire, PARIS/Farnsworth timing, and cumulative sample rounding; verify equal-speed, stretched-spacing, invalid-speed, and cumulative-duration fixtures across the automatic speed grid at three sample rates in src/timing.rs tests.
- [x] 2.3 Implement block scheduling and delivered-pace summaries; verify full-character limits, final gaps, rescue accounting, and exclusion of response-tail time from WPM.
- [x] 2.4 Document public timing/event interfaces and units; verify the interface examples reproduce the golden timing calculations.

## 3. Copying and recognition scoring

- [x] 3.1 Implement normalized attempt and tail-editable final streams with surviving-input timestamps; verify backspace, unsupported input, case, spaces, and correction examples.
- [x] 3.2 Implement onset-gated unit edit distance and bounded primary/secondary scores; verify empty, all-wrong, excess-input, skip/rejoin, and premature-input fixtures.
- [x] 3.3 Implement all-optimal-path outcome agreement and operation-count ranges; verify repeated-symbol ambiguity and compare tiny-string results against exhaustive path enumeration.
- [x] 3.4 Implement recognition first-response, timeout, disclosure, assistance separation, and compromised-trial rules; verify early input, eight-second maximum timeout, post-reveal repetitions, and technical interruptions.
- [x] 3.5 Document score semantics with attempt/final examples; verify every documented example through the scorer rather than equating correction with mastery.

## 4. Learner state and review

- [x] 4.1 Implement exact-context windows, time discounting, Beta summaries and reliability guards; verify prior, half-life, evidence/date thresholds, context separation, and reference quantiles.
- [x] 4.2 Implement nearest-rank latency summaries and conditional confusion estimates; verify negative-latency exclusion, minimum sample counts, directed substitution thresholds, and omission separation.
- [x] 4.3 Implement due review interval updates and disclosure eligibility; verify growth/caps, halving/floors, early practice, assisted exclusions, and slow-correct accuracy retention.
- [x] 4.4 Document uncertainty and retention semantics; verify UI terminology does not claim observed forgetting solely from elapsed time or calibrated certainty from approximate evidence.

## 5. Practice selection

- [x] 5.1 Implement entry assessment and K/M bootstrap; verify two-minute bounds, partial/unobserved coverage, familiarity labels, and bootstrap exemption from the new-symbol limit.
- [x] 5.2 Implement quota allocation, category interleaving, weights, empty-category redistribution, and nonadjacent recognition sampling; verify 8/5/4/3 allocation, tie order, sparse states, and one-symbol eligibility cases.
- [x] 5.3 Implement introduction separation heuristic and review scheduling; verify pattern-distance ties, per-session limit, and same-context qualification resets.
- [x] 5.4 Implement groups, text eligibility, and practice/check corpus separation; verify only introduced symbols appear and that exhausted text falls back with the correct material label.
- [x] 5.5 Document selection reasons and record selected outcomes; verify replay uses stored material without depending on an RNG implementation.

## 6. Adaptive controller and rescue

- [x] 6.1 Implement per-mode speed/timeout states, context streaks, sample windows, bounds, and precedence; verify upward/downward/hold cases, alternating material classes, low-count aggregation, and session resets.
- [x] 6.2 Implement live minimum-prefix backlog bounds from history prefixes only; verify missed-character recovery, stable lag, ambiguity, and that future inputs/audio cannot affect earlier decisions.
- [x] 6.3 Implement rescue conjunction, cancellation, boundary scheduling, duration/cooldown limits, second-rescue termination, and no-input resume; verify every rescue condition individually and in combination.
- [x] 6.4 Implement session mode selection and temporary overrides; verify cap precedence, compromised-block handling, override restoration, and 600-second new-block cutoff.
- [x] 6.5 Document controller reasons with actual evidence values; verify displayed speed and rescue reasons match decision logs in scripted traces.

## 7. Checks and analytics

- [x] 7.1 Implement check eligibility, offered-date limit, unfamiliar selection, and fixed-condition execution; verify decline, stop, pause, pool exhaustion, and full-character three-minute scheduling.
- [x] 7.2 Implement milestone grouping and sustainable-speed reporting; verify matching conditions, distinct dates, attempt score, policy/corpus versions, and no alphabet-wide claim for narrow repertoires.
- [x] 7.3 Implement comparable-context trends and progress summaries; verify six-block minimum, numeric mean difference, coverage counts, and assistance/material separation.
- [x] 7.4 Document assessment interpretation; verify the summary distinguishes transmitted pace, completion lag, attempt accuracy, final transcript accuracy, and incomplete checks.

## 8. Application integration

- [ ] 8.1 Integrate keyboard session controls and low-latency playback using the approved engineering design; verify measured audio/input tolerances, uninterrupted typing during copying, and the callback-allocation/queue-pressure tests in engineering-design.md.
- [x] 8.2 Integrate local persistence, history review, export, reset, and interrupted-write recovery; verify offline restart and failure scenarios against the section 1 guarantees.
- [x] 8.3 Deliver the normal launch/readiness/practice/summary flow; verify no manual WPM or exercise selection is required, and stopping early preserves completed evidence.

## 9. End-to-end mathematical acceptance

- [x] 9.1 Run scripted learners for delayed accuracy, substitutions, skip/rejoin, correction-heavy input, stable lag, overload, and no input; verify bounded control and attribution expectations without claiming simulated learning effectiveness.
- [x] 9.2 Replay complete sessions under a frozen policy, numeric implementation, and recorded material; verify scores, state updates, and decision reasons match the originals within documented numeric tolerances.
- [x] 9.3 Run the selected platform checks and `openspec validate define-adaptive-cw-training --strict --no-interactive`; verify runtime evidence is recorded separately from artifact-format validation.

## Workflow follow-up

- Archive only after application implementation, checks, and review are complete.
- Comparative learning-effectiveness research remains separate from functional acceptance.

## Evidence and remaining boundary

- Software: `cargo test --locked` (75 checks), strict Clippy, rustfmt, release build,
  exhaustive alignment/prefix reference, frozen-clock policy/session traces,
  transactional restart/crash/export/reset checks, and OpenSpec strict validation.
- Native: recognition and copying terminal sessions, long pause/resume, partial stop,
  complete two-rescue/no-input recovery, binary replay, and a 30-minute silent native
  scoring/storage stress run. The measured callback size was 128 frames at 48 kHz;
  render and clock-mapping results are in the verification document.
- 8.1 software controls, bounded queues, callback allocation guards and terminal
  flow are implemented. Its physical latency/responsiveness tolerances remain
  unmeasured alongside 1.2. Do not close either checkbox or archive this change on
  the strength of software callback measurements.
- Remaining physical work needs calibrated loopback/input measurement equipment and
  route-specific observation; it is not an additional database/framework decision.
  Human learning-effectiveness evaluation remains research, not a software test.
