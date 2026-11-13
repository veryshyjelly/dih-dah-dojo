# Adaptive CW specification and mathematical design

Status: product requirements, cw-policy-v1 mathematical design, and future
implementation tasks are drafted. Application code is not implemented. Engineering
readiness decisions remain explicitly gated.

Read in order:

1. [Proposal](proposal.md): learner, outcome, capabilities and scope.
2. [Mathematical design](design.md): formulas, priors, thresholds, controller precedence,
   rescue, assessment conditions, and reproducibility contract.
3. [Rust architecture](engineering-design.md): callback constraints, ownership, queues,
   control delivery, clock mapping, latency targets and hardware proof obligations.
4. [Mathematical fixtures](mathematical-fixtures.md): numeric examples and acceptance cases.
5. [Remaining decisions](open-questions.md): engineering gate and research/tuning boundaries.
6. [Implementation tasks](tasks.md): dependency-ordered work with verification per task.

## Capability specifications

- [Entry assessment](specs/entry-assessment/spec.md)
- [Recognition practice](specs/recognition-practice/spec.md)
- [Continuous copying](specs/continuous-copying/spec.md)
- [Adaptive progression](specs/adaptive-progression/spec.md)
- [Progress assessment](specs/progress-assessment/spec.md)
- [Session experience](specs/session-experience/spec.md)
- [Local history](specs/local-history/spec.md)
- [Morse timing](specs/morse-timing/spec.md)
- [Copy scoring](specs/copy-scoring/spec.md)
- [Learner estimation](specs/learner-estimation/spec.md)
- [Training policy](specs/training-policy/spec.md)
- [Real-time execution](specs/realtime-execution/spec.md)

## Terms

**Attempt accuracy** scores every accepted printable attempt, even when erased.
**Final accuracy** scores the surviving transcript. They are different metrics;
“first-pass” copying accuracy is no longer an undefined third quantity.

**Independent** excludes answer disclosure and rescue as defined in design.md.
**Reliable** is a context-specific evidence label, not permanent mastery.
**Sustainable speed** requires completed unassisted checks under stated conditions.
**Rescue** is bounded added quiet time, not proof of cognitive overload.

## Validation and readiness

Run `openspec validate define-adaptive-cw-training --strict --no-interactive` and
`openspec status --change define-adaptive-cw-training`.

Artifact completeness checks file structure, not application implementation or
learning effectiveness. Resolve tasks section 1 before application coding. Keep
this change unarchived until the actual implementation and checks are complete.
