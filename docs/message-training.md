# Phrases and Messages engine

`dojo_core::messages` is a pure, bounded practice module. It does not update the
guided learner, automatic speeds, introduced characters, or verified milestones.
The curriculum choice is an instructional product inference, not evidence that
this implementation improves Morse learning effectiveness.

## Original content and purpose

The first corpus has 128 short phrases and 128 short messages, formed from reviewed
templates and eight controlled values in each of four families: time, place,
objects and weather. Phrases contain three or four words; messages contain six to
eight. Examples include `MEET AT SEVEN`, `SEND A RED MAP`, and
`WE MEET AT SEVEN NEAR CAMP`. A changed factual value changes the audible message.
This is a finite corpus with deliberate repetition, not a shelf to complete.

The authored practice templates and facts in `crates/dojo-core/src/messages.rs`
are original Dojo text dedicated to [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).
That dedication covers the instructional material; executable code retains the
repository's code license. No third-party course texts, user text or reserved
assessment passages are copied into this material.

Three tasks remain distinct:

- `copy`: submit the complete heard text. First-submission and later repaired
  character accuracy and exactness remain separate.
- `detail`: hear the material, then recover one factual detail. The UI must hide
  the question and choices until playback has ended. This task also depends on
  memory and language familiarity, not only Morse decoding. Canonical accepted
  forms are explicit; for example NINE, 9 and AT NINE refer to the same fact.
- `listen`: report `understood`, `partly` or `missed` after hearing the material.
  Self-reports and finished exposure never create objective accuracy scores.

## Contract and identities

WASM exposes `message_catalog()`, `message_generate(config_json)` and
`message_evaluate(activity_json)` through the existing worker client. Catalog
metadata includes corpus/version/provenance plus stages, tasks and family labels.

Generation accepts `seed` (u32), `count` (1–30), `stage` (`phrase` or `message`),
`task` (`copy`, `detail`, `listen`), `family` (`time`, `place`, `object`, `weather`,
`mixed`), `repertoire`, `c` and `e`. Character speed is 5–120 WPM; effective speed
is 1 WPM through character speed. Defaults are phrase/copy/mixed, 10 items, the
complete existing 42-symbol repertoire, and 20/5 WPM. An explicitly empty repertoire
is empty, not a request to broaden it. Unsupported or oversized input is rejected.

Only material wholly within the selected repertoire and existing 180-second
schedule bound is available. The result is `{items, available, reason}`. Count is
capped to distinct available items. A zero pool explains its limitation; generation
never silently selects unfamiliar characters. `required` lets the UI compare an
explicit broader selection against introduced characters.

Each item contains id/content_id, stage/task/family/topic/repertoire, text/audio_text,
question/expected/accepted/choices, required symbols, word count and estimated signal
seconds. The duration follows the existing sample schedule and omits only its final
silent gap. The browser uses existing token-mode audio preparation; rendering and
all internal Morse intervals are unchanged.

`content_id` is `m1-<content-index>` and identifies exactly the same audio independently
of task, family selection, repertoire, seed or pace. The canonical item identity is
`msg1:<task>:<selected-family>:<canonical-repertoire>:<content_id>`. The family is the
configured selection; `topic` identifies the actual material family. Resolving the
ID regenerates text, question, accepted facts and choices rather than trusting any
submitted target. Seconds are recomputed from the activity's recorded c/e.

Pool shuffling reduces u64 random values before converting indices, producing
identical native-64/WASM-32 ordering. A regression fixture at seed42, message/copy,
mixed family, repertoire `GUVSAZWDPRMEBCNXJQKT`, 20/5 WPM yields content IDs
`m1-133`, `m1-196`, `m1-193` with three available items.

## Records and evidence

New `kind=message` records use a `CWMSG001` prefix followed by Postcard. Existing
`language_encode/decode` dispatch this packet while preserving old word, story,
callsign and prosign layouts. The common owner-scoped sync and backup activity
frames therefore remain additive; no database schema or new dependency is needed.

The envelope retains common fields and adds mandatory `trial_id`, `revision` (0–31)
and `familiar` (boolean declared when presented). Record IDs are
`<trial_id>-<revision>`. `attempts` is a list of whole submitted answers, with the
first submission retained during repair. Explicit unknown is an empty submitted
answer and an independent miss. Objective answers require `self_report:null`; a
non-null answer must agree with its latest full submission. New message self-reports
are the three strings above, while old language self-report booleans remain unchanged.

Unanswered complete or interrupted exposures remain valid unscored records. A
listening self-report requires completed playback and never contains objective
answers. Replays, disclosure, review and interruptions exclude independent scoring.
Familiar material can have independent answers, but must remain in its own comparison
context. The declaration means familiar versus new in available history; it cannot
prove a globally first encounter when other device history is unavailable.

Compare task, stage, selected family, repertoire, input profile, requested pace,
corpus/version and familiarity separately. Copy character accuracy is not detail
recall accuracy, and neither is a universal measure of comprehension. No response
latency, mastery or proficiency metric is introduced. Accepted targets and repairs
do not erase the independent first answer.

## Legacy safety and limits

`story-1` through `story-6` retain their exact original text and sentence order for
history, bookmarks, decoding and backup restoration. Do not relabel their exposure
as detail-recall results. Tests pin the legacy story asset, reserved assessment
asset and an original-format story packet by SHA-256, while validating all 256 new
content variants across all three tasks.

Physical sound-at-ear timing, device/input latency, prolonged phone capacity and
learning effectiveness remain unverified. The existing physical engineering gate
is open. Template-controlled variation supports useful task definition and honest
comparison; it is not proof of transfer to unseen natural messages.
