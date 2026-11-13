# Remaining decisions and mathematical readiness

## Resolved mathematical policy

The accepted baseline is [cw-policy-v1](design.md). Its sections resolve:

| Previously open topic | Design section |
| --- | --- |
| Character/effective speed, spacing and delivered pace | 2 |
| Corrections, attempt score, omissions, time gates and ambiguity | 3 |
| Accuracy uncertainty, latency, confusion and review intervals | 4 |
| Entry assessment, introduction, review and material sampling | 5 |
| Mode mixing, block/session boundaries, speed bounds, overrides | 6 |
| Intentional lag versus intervention, rescue bounds and recovery | 7 |
| Familiarity, comparable checks, milestones, sustainable speed, trends | 8 |
| Raw history, clocks and policy replay | 1 and Migration Plan |

Copying now uses **attempt accuracy**, the learner-approved append-only stream
metric; this replaces ambiguous first-pass language. Corrections can increase edit
penalties while improving final-transcript accuracy. Do not reinstate a hidden
“quick typo correction” exemption.

## Engineering readiness gate

These are deliberately unresolved, and application implementation tasks depend on
resolving them. The presence of design/tasks artifacts does not waive the gate.

- Numerical dependencies and their versions/accuracy checks. Rust, module boundaries,
  execution lanes and audio/input ownership are decided in
  [engineering-design.md](engineering-design.md); crate versions are pinned during
  the first compiled prototype.
- Execute the audio/input measurement protocol in engineering-design.md on the
  target Mac. Targets and failure handling are specified; actual route/device
  measurements and supported buffer configuration remain unverified.
- Persistence format/engine, durability and interrupted-write guarantees, recovery,
  export format, reset scope and user confirmation flow, and future policy migration.
- Licensed/author-owned bundled text corpus, sufficient unseen check material,
  versioning and record identity. The selection and exhaustion rules are already fixed.
- Manual speed-setting engineering limits consistent with positive E<=C.

Implementation tasks are in [tasks.md](tasks.md); section 1 records how to close
this gate before integration. Mathematical fixture prototypes can be verified first.

## Research and later tuning

The 95% three-minute milestone, evidence half-life, response threshold, quotas,
review growth factor, and rescue thresholds are engineering defaults, not validated
scientific constants. The discounted Beta summaries are approximate model intervals.

To evaluate teaching effectiveness later, define a comparison with fixed progression
at comparable practice time, with delayed retention and unfamiliar-material tests,
prior-experience and typing controls, and a predeclared outcome analysis. Personal
improvement alone does not establish general superiority of adaptive practice.

Policy tuning must use a new version and retain original-version observations and
results; label recomputed estimates. Numeric mean-score trends are descriptive,
not causal claims of learning or observed forgetting.
