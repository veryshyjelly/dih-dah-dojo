# Prosign engine and evidence

Prosigns are explicit atomic Morse units. `<AR>` compiles as `.-.-.` with one
dot unit between every element; ordinary `AR` still compiles as A, a normal
three-unit letter gap (expanded under Farnsworth timing), and R. A word boundary
uses seven spacing units. This is opt-in through `prosigns::compile_text`,
`Schedule::compile_tokens`, and `AudioKernel.prepare_tokens`; existing character
compilation, the 42-character repertoire, learner IDs, and old records are unchanged.
Preparation allocates before playback. The audio renderer and transport callback
are unchanged. Atomic multi-character markers use NUL in the legacy character
field, and are addressed by their schedule index, never by learner character IDs.
Interactive `AudioKernel.prepare_tokens` removes only the schedule's final silent
word gap before playback, so answering is enabled at the final tone rather than
after several seconds of Farnsworth silence. Interior timing and the existing
last-tone envelope are retained; ordinary `prepare` is unchanged.

## Sources and operating scope

- [ITU-R M.1677-1](https://www.itu.int/rec/R-REC-M.1677-1-200910-I), in-force
  International Morse code recommendation: element and spacing timing; separator,
  end-of-work, wait, understood, error, and starting signals.
- [EUCW prosigns](https://www.eucw.org/op/en/prosigns.html): joined notation and
  amateur meanings, including AR usage variation and uncommon CT use.
- [IARU operating guide, edition 4 revision 4.2.0](https://www.iaru-r1.org/wp-content/uploads/2026/07/IARU-Ethics-and-Operating-Procedures-for-the-Radio-Amateur-4th-Ed-v4.2.0_F.pdf),
  section 13.2: both spaced and joined KN/BK conventions occur in amateur use.
  Dojo uses ITU timing, including the normal **three-dot** inter-letter gap.

The first set is BT, AR, SK, AS. HH, joined KN, VE, and CT are optional additions.
HH denotes the standard eight-dot error signal; the letters are a mnemonic.
Joined KN is labeled an amateur variant rather than a universal standardized
form. BK is explained as variable, not automatically rendered joined. CQ, DE,
TU, CL and Q-codes remain ordinary spaced operating abbreviations.

BT and `=` are the **same waveform**, as are AR and `+`. Recognition accepts
these aliases, and no exercise asks learners to distinguish them acoustically.
Scenario exercises illustrate an intended operation, not a mandated universal
QSO sequence. The scenarios are original Dojo content.

## WASM contract

- `prosign_catalog()` returns version/corpus information, eight signals with
  token, pattern, semantic answer ID, meaning, convention, aliases and source,
  and the three practice mode descriptions.
- `prosign_generate(config_json)` takes `seed` (u32), `count` (1–30), `mode`
  (`recognition`, `meaning`, `context`) and `signals` (1–8 unique uppercase IDs).
  Selection order is canonicalized alphabetically.
- Random selection reduces a u64 before conversion to an array index, preserving
  identical generation on native 64-bit and WASM 32-bit targets.
- Item IDs are `ps1:<mode>:<comma-separated-selection>:<seed>:<index>`. The
  versioned resolver reproduces each item's target, choices and context.
- Recognition plays the joined signal and accepts a complete token on submission.
  Meaning plays it and accepts a semantic choice ID. Context presents an operating
  scenario without target audio, then permits the contextual example after
  disclosure. Those modes are separate evidence contexts.
- `prosign_evaluate(activity_json)` recomputes first/final exactness, eligibility
  and accepted aliases. First answers, not repair results, determine attempt scores.
- Existing `language_encode/decode` dispatches prosign activities through new
  `CWPROS01`-prefixed Postcard packets; word, story and callsign packets preserve
  their existing serialization. No persisted JSON or new database frame is added.

Activities share the existing language envelope and add `trial_id`, `revision`
(0–31), and optional nonnegative typing-inclusive `latency_ms`. IDs are
`<trial_id>-<revision>`. `attempts` holds full submitted answers, including an
empty unknown response; `answer` agrees with the latest submission. Initial
independent misses remain misses after repair. Replay, reveal, review and technical
interruption are retained separately. A missing response is not independent
evidence; an explicit unknown response is an independent miss.

The engine rejects invalid kinds, noncanonical/unknown item IDs, inconsistent
submissions, negative timestamps/latencies, unsupported input profiles, invalid
pace, oversized packets and trailing bytes. It schedules the generated audio to
enforce the existing 180-second block limit. Modes and selections are regenerated
from versioned IDs instead of trusting submitted target metadata.
An answer must have a nonempty submission history and vice versa, so a later
revision cannot invent an omitted first submission. Reveal without an answer
retains `answer: null` with no submissions and is assisted, not an independent miss.

No prosign result updates guided automatic pace, the character learner, or verified
milestones. Software schedule tests do not prove physical output/input latency or
learning effectiveness; the existing physical timing gate remains open.
