# Requirement completion audit

Audit date: 2026-11-14. Scope: the twelve capability specifications in
`openspec/changes/define-adaptive-cw-training/specs/`, their cw-policy-v1 baseline,
the versioned v1.1/v1.2 progression and boundary clarifications, and engineering proof obligations.
Green tests alone do not establish physical timing or human learning effectiveness.

| Capability | Implemented evidence | Verification boundary |
| --- | --- | --- |
| Entry assessment | `trainer.rs` bounded first placement, partial coverage, K/M teaching; `planner.rs` repertoire | Native partial-entry flow, interrupted-bootstrap guard, and capture/controller fixtures; unfamiliar remains distinct from mastery |
| Recognition practice | First capture-time response, explicit unknown, deadline, replay/disclosure, compromise labels | Capture boundary tests; timed record replay; native unknown/disclosure/stop |
| Continuous copying | Concurrent input/audio, append-only edits, prefix backlog bounds, bounded rescue and tail | Native correction/pause/rejoin/stop, two-rescue/no-input completion, exact prefix references |
| Copy scoring | Time gates, two transcripts/scores, all-optimal agreement, edit ranges, bounded workspace | 1,922 exhaustive pairs, 100 longer prefix comparisons, correction/rejoin/resource-failure traces |
| Morse timing | PARIS/Farnsworth sample schedules, full-character limits, final gaps, rescue-adjusted pace and non-space throughput | Speed grid at three sample rates; six-second PARIS fixture; rescue/tail throughput fixture |
| Learner estimation | Exact-context discounted Beta summaries, latency/confusion, due reviews and assistance separation | Reference quantiles, half-life/date/context limits, slow/early/assisted review fixtures |
| Adaptive progression | Per-mode speed states, uncertainty/review selection, gradual changes and deliberate overrides | Up/down/hold/floors/caps and cross-material/session traces; v1, v1.1 and v1.2 replay |
| Training policy | Recorded quotas/outcomes, bounded sampling, intro/text precedence, conjunctive rescue, check conditions | Seeded selection, low-count windows, omissions, stable lag/overload/no-input traces |
| Progress assessment | Offered-date guard, unfamiliar pools, fixed 180-second checks, repeated-day milestones, comparable trends | Native 180-second synthetic check; date/repertoire/material/policy/corpus pairing and trend tests |
| Local history | One offline learner, atomic record+state, explicit reset, binary snapshot export, refusal of unsupported/corrupt data | CLI restart/export/reset, compact-index rebuilding, child-exit recovery, advisory-lock, byte-compatibility and streaming-allocation tests |
| Session experience | Default terminal launch, readiness/volume, mixed blocks, summaries, early retention, keyboard controls | Native sessions, long pause, normal/Ctrl-C restoration; real-PTY typing/drawing workload |
| Real-time execution | Prepared native CPAL output, safe bounded ownership transfer, input/UI/analysis/writer isolation | Allocation/telemetry-loss/retirement/blocked-renderer/full-analysis-queue tests; native stress and software latency reports; **physical timing remains open** |

## Required verification still open

OpenSpec task 1.2 and the physical portion of 8.1 are not complete. Calibrated
loopback is needed for acoustic onset, gaps and stop/pause-to-silence; route-specific
measurement is needed for wired/Bluetooth claims. Physical key-switch and terminal
presentation timing are outside software receipt/draw measurements. The application
labels routes unverified and the OpenSpec change remains unarchived.

No benchmark proves adaptive practice teaches better than fixed progression. That
requires a separate human-learning evaluation with retention and unfamiliar-material
outcomes. An arbitrary backup-import feature and multiple learners/platforms are
not part of the agreed current scope.
