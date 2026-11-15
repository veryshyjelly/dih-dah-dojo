## Technical Approach
Add a pure messages module with message_catalog, message_generate and
message_evaluate WASM APIs. New kind=message records use a CWMSG001-prefixed
Postcard packet through the existing language codec and owner-scoped transport.
Do not modify old word/story/callsign/prosign binary layouts or guided policy.

Material uses original coherent templates and reviewed fact variations in time,
place, object and weather families. Two stages, phrase and message, vary chunk
length. Three tasks, copy/detail/listen, remain separate evidence contexts. The
detail task displays its factual question only after audio finishes, and measures
message-detail recall with memory and language demands, not universal comprehension.
Listening self-reports are exposure, with no objective accuracy score. No latency
metric is introduced. Requested pace and estimated signal duration are labeled.

Generation accepts seed/count/stage/task/family/repertoire/c/e and returns actual
available items plus an honest empty reason. It never silently broadens a selected
repertoire. New stable item identities regenerate content and questions; content_id
identifies the audio independently of task/config/seed. Familiarity is declared at
presentation using available synced and pending history and earlier round material.
Label it New in available history versus Familiar material; offline history is not
proof of a globally first encounter. Repetition remains useful and separately labeled.

Full submitted answers are immutable trial revisions (0–31), not keystroke
snapshots. First submissions remain primary evidence after repairs, replay or
disclosure. Unknown is an independent miss. Accepted persistence starts before
worker evaluation, retaining store reset-generation protection. Pause and finish
reconcile accepted results without stale UI or new-round mutations. Audio uses
the existing token-capable preparation path to omit its final silent gap; callback
rendering remains unchanged. Stop/cancel on navigation, pause, faults and supersession.

Words has local subviews for individual words and Phrases & Messages; no new
top-level destination is added. Existing guest-local Words policy is retained with
contextual sign-in prompts. Connected activities sync/export/restore/reset via the
existing activity table and backup frames. Do not invent mastery or guided promotion.

Words progress adopts the readable Callsigns hierarchy: clear header/sync/actions,
stacked statistics, compact bounded graphs, explicit filters, searchable/paginated
word results, selected details and bounded history. Exact-word accuracy describes
the final copy; original attempt/final character semantics remain unchanged.
Historical word repertoires are unavailable and must not be reconstructed.
Connected progress separates task/stage/family/repertoire/input/pace/corpus/version
and familiarity, showing independent first and repaired outcomes separately.

Legacy /stories and /progress?mode=stories remain accessible as an archive and old
bookmarks remain stopped until activated. Preserve assets/stories.tsv IDs, sentence
order and exact text because the old resolver uses them during decode and import.
Never convert old listening exposure into message-detail scores. Keep reserved
assessment material unexposed. Archive graphs are bounded; do not put a catalog of
unstarted stories ahead of progress.

Catalog loading, activity loading and synchronization have separate states. A
catalog failure shows an explicit retry state without false zero totals or success
copy hiding the error. Empty and assisted-only histories explain useful next steps.
Selected progress tabs use valid colors in both themes. Selection/detail focus,
keyboard navigation and mobile labels are verified in actual rendered fixtures.

## Team Ownership
- Engine: content/templates, canonical generation, validation/scoring, binary/WASM.
- Practice: MessagePractice component, scoped stylesheet and lifecycle tests.
- Progress: Words/connected/archive views, queries, shared types and focused tests.
- Orchestrator: OpenSpec/research, routes/retirement, shared fixes, integration,
  compatibility/workload verification, commits and deployment.
