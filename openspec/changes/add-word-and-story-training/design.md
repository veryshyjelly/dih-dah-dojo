## Context

The web engine accepts custom copying text, while the current tool generator
produces character groups or callsigns, not a vocabulary curriculum. The bundled
CC0 corpus contains six practice passages and five reserved assessment passages.
Existing web sources are `guided`, `tool`, and `demo`; only guided evidence updates
automatic learner state. Do not relabel new activity as guided to obtain storage.
See [research.md](research.md) for sources and evidence limitations.

## Goals and defaults

- Add Words and Stories entries to the existing public Tools area; preserve
  Continue Training as the dashboard's primary action.
- First release is English receiving practice. Both activities work without an
  account; signed-in activity and bookmarks sync through the existing backend.
- Start word sessions with 10 words, a 2–3 letter length filter, typed responses,
  and manual Next. Offer 4–5, 6+, and all lengths, plus listen-and-reveal.
- Signed-in word selection defaults to the active input profile's introduced
  letters. Guests choose a repertoire, initially A–Z and explicitly labeled.
  An explicit all-letters choice is allowed without introducing those characters
  into guided training. Never silently expand an insufficient repertoire.
- Keep current character/effective WPM controls. Initialize from the signed-in
  copying profile or the existing guest tool defaults (20/10); manual changes
  remain activity settings. No new timing algorithm is part of this release.
- Story mode defaults to sentence-by-sentence listening with manual Next.
  Continuous listening and sentence transcription are explicit alternatives.

## Content and selection

Create a separate versioned catalog with stable item IDs, provenance/license,
normalized transmission text, and derived repertoire. Author a reviewed starter
list of at least 100 everyday English words spanning the length filters and a
separate labeled radio-abbreviation set of at least 20 entries. Call these common
words, not a statistically ranked frequency list without a documented source.
Abbreviations include a plain-language meaning in post-disclosure feedback.

Start with six short original stories (roughly 40–100 words each), adapting the
six existing CC0 practice passages where useful. Keep originals and assessment
selection unchanged. Store explicit sentence boundaries rather than splitting on
punctuation at runtime; validate every transmitted symbol. Use simple vocabulary
and everyday, gentle mystery, or radio themes. Story cards show vocabulary/length
information, required characters, and duration computed from the actual schedule
at the selected pace, excluding learner pauses and replay. Do not claim a tested
proficiency level. Missing introduced characters are advisory, not a story lock.

Use a seeded Rust query to filter words by selected repertoire, set, and length,
then sample without replacement. If fewer than 10 eligible words exist, disclose
the smaller round; if zero, offer filter changes rather than unrelated material.
Do not use assessment text to fill content gaps. Catalog asset formats may be
readable text; persisted learner activity remains versioned binary data.

## Interaction and player lifecycle

Words use listening → responding → feedback → next. Allow typing during playback
but accept submission only after the word finishes; permit tail editing before
submission. Enter submits, then a subsequent Enter or Next advances only after
the submission key is released. There is no response deadline. Replay before
submission marks that trial assisted; reveal without submission records an
unanswered/revealed trial. Keep the learner answer and expected word in stable
positions until Next. Listen-and-reveal may collect optional Got it/Again
self-reports, but these are never typed accuracy. A review round uses missed or
revealed words and is labeled repeated material, separate from the initial round.

Stories retain the learner's place by story ID, content version, and sentence ID.
Replay affects only the current sentence. Reveal shows that sentence; earlier
revealed sentences remain in a transcript without exposing future text in the
rendered or accessibility tree. Previous permits deliberate revisiting. Continuous
listening advances at sentence boundaries without revealing text and can return
to sentence mode at a boundary. Pausing mid-sentence resumes from its beginning.
Optional transcription uses one sentence per attempt and the existing append-only
attempt/final transcript rules; it has no automatic deadline or answer disclosure.
Reveal/replay makes the affected attempt assisted. Unanswered listening has no
accuracy score. Completion means every sentence has finished playback at least
once, not that the learner understood or mastered it.

Share one audio owner with existing practice/previews. Navigation, mode changes,
and rapid replay cancel old scheduled work; stale completion callbacks cannot
advance a new item. F5 pauses/resumes, F6 replays the word/current sentence, and
Esc exits the activity; visible controls support touch and keyboard. Space controls
play/pause only outside text inputs. Native dialogs retain keyboard priority and
help pauses activity. Audio suspension/lost continuity pauses and labels an
interruption; it is never a wrong answer. Reload restores a stopped bookmark, not
autoplay. Sentence playback uses bounded preparation and the existing Rust audio
kernel; never render a whole story into an unbounded in-memory recording.

## Evidence, interfaces, and persistence

Add typed word-session, story-cursor, and language-activity models. A separate
versioned web binary envelope records activity/item IDs and versions, input mode,
requested timing, delivered/interrupted playback, answers, replay/reveal order,
review status, and optional self-report. Listening, typed attempts, and self-report
are separate variants. Do not change native Record/Profile layouts or append
unversioned variants to existing Postcard enums.

Calculate typed word correctness in Rust by exact match after trimming surrounding
whitespace and uppercasing ASCII; internal spaces are not removed to manufacture a
correct answer. No spelling autocorrection. Report initial-round exact word
accuracy over completed unassisted typed trials (including explicit skips), show
the denominator, and list assisted/revealed/interrupted counts separately. A round
with no eligible typed trials has no accuracy percentage. Reuse current sentence
copying attempt/final scoring rather than inventing a competing edit metric.

Keep these activities out of guided adaptation, character introduction, verified
milestones, and existing comparable accuracy/latency graphs. Show separate Words
and Stories activity summaries; do not compare word-answer time with character
recognition latency. Revisited story sentences and review words remain labeled.

Persist guest records/bookmarks locally in a dedicated versioned store. Signed-in
records use owner-scoped local storage/outbox and separate authenticated API
resources backed by binary payloads in SQLite. Reuse existing ownership, origin,
size/queue limits, idempotent IDs, revisions, and reset-epoch protections. The server
validates catalog IDs/versions and derives scored outcomes rather than trusting a
client percentage. Bookmark conflicts use accepted server revision order, without
discarding distinct attempt records. No silent migration of guest activity into an
account. Sign-out isolates owner data; API outages retain pending activity with
honest sync status. Blocked local storage permits temporary play with an explicit
unsaved indicator. Export, reset, deletion, backup, and restore must cover these
records; old pending uploads cannot resurrect reset activity.

Deploy persistence/API support before the UI that writes new activity. Preserve old
clients and exports, and handle unknown content versions explicitly rather than
binding saved answers to changed text. A removed version keeps readable history;
offer restart on the new version instead of silently moving a bookmark. Release
words first, then stories after the shared persistence/player checks pass.

## Verification

Test selection boundaries and reproducibility, transmission text validity,
assessment-content exclusion, normalization/denominators, replay/reveal ordering,
and complete separation from guided state. Cover owner isolation, duplicate/stale
uploads, reset races, offline recovery, binary compatibility, and export/restore.
Browser checks cover light/dark, desktop/mobile, long answers, stable feedback,
hidden future text, keyboard/touch, dialogs, navigation/replay races, bookmarks,
continuous transitions, and audio interruption. Measure the combined audio/input,
rendering, scoring, and storage workload against existing targets; retain the
physical timing gate and document unmeasured hardware/browser limitations.
