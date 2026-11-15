# Callsign training

Open **Callsigns** in the website navigation. Sign in to start rounds and keep
their progress with your account. The format library is public reference listening
and does not create practice evidence.

## Start a round

Choose a short, international, long or portable/slash family, or mix families.
Examples are original synthetic receiving material, not an assigned-station lookup.
The readiness note identifies sounds outside your introduced repertoire; this
manual activity never introduces them into guided training automatically.

Choose character WPM (the sound's shape), effective WPM (spacing), and a round
length. Fixed pace is the default. Optional adaptive pace changes effective speed
between calls, within character speed, without changing your guided targets.
Replayed, revealed, reviewed or interrupted practice cannot promote the pace.

1. Play a call and listen to its whole identity.
2. Type the complete call and press Enter to check it.
3. Compare your first copy with the expected call. Correct it if useful; the first
   result remains unchanged. Use component/character listening after disclosure.
4. Choose Next when ready. Finish or pause whenever needed.

F5 pauses/resumes, F6 replays and Esc finishes. On a phone, use its keyboard to type
the call. The displayed keyboard/touch input profile remains part of the record.
Opening help, hiding the page or leaving stops/pauses the sound safely.
**I don't know** records a first-pass miss; **Reveal · assisted** is a separate
peek excluded from independent accuracy. Repairs do not replace the original result.

## Exercise choices

- **One whole call:** clean complete-call reception, without a forced response timer.
- **Catch the missing part:** submit the part you heard, request another listen and
  repair the same call. The original partial copy remains independent evidence.
- **Find the calling station:** identify the target inside a CQ/DE exchange. The
  learner's station and the calling station have distinct roles.
- **Call + serial number:** copy the identity and contact number into separate fields.
- **Call + CQ zone:** copy the identity and zone, scored separately from the call.
- **One voice in the crowd:** follow the target through a bounded overlapping caller.

Clean audio is the starting condition. Optional noise and fading add separately
labeled practice conditions. The overlap exercise uses a second sample-clock Morse
source at a higher pitch. Copy the lower-pitched target. This is a practice aid,
not a full radio/contest simulator.
All layers stop when the primary signal ends, on pause/finish or after an audio fault.

## Understand progress

Open **Your progress → Callsigns**. Exact first-pass accuracy asks whether the entire
call was correct. Character-level alignment diagnoses submitted-text differences;
it cannot identify the unique psychological cause of an error. A repaired correct
copy never becomes a first-pass success.

Submitted copies save immediately as immutable revisions of one presented call.
Progress counts the presentation once, retains the first independent result and
shows its latest repaired copy. Unknown/missing initial records are not inferred to
be independent. Replays, reveals, review and interruptions remain labeled.

Graphs show requested character/effective pace, exact-call accuracy and response
latency. Select comparable conditions and latest 30, 100 or all independent calls.
Keyboard/touch, corpus version, family, exercise, signal condition, fixed/adaptive
mode and requested pace are explicit comparison conditions. Latency includes typing
and needs at least eight correct independent nonnegative samples before a graph
point is shown. Requested pace is not a physical delivered-speed measurement.

Use graph point inspection and history details to examine actual samples. Review
missed calls reuses their stable identities and records the new presentation as
review. No graph establishes mastery or updates guided milestones.

## Synchronization and backups

Signed-in activity uses the existing owner-isolated synchronization and retains
pending records in the browser if the API is unavailable. Settings account export,
browser activity export, import/restore and reset include callsign records alongside
words and stories. Old word/story bytes remain compatible. New callsign packets use
the versioned `CWCALL01` Postcard envelope, not persisted JSON.

The [OpenSpec research notes](../openspec/changes/add-callsign-training/research.md)
record the reference tools, international-format sources and dataset decisions.
Physical audio/input timing and learning effectiveness remain unverified.
