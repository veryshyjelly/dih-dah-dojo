# Remaining decisions and mathematical readiness

## Resolved mathematical policy

The accepted baseline and implemented v1.1 extension are [documented here](design.md). Its sections resolve:

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

Rust/native execution ownership, pinned numerical dependencies, Beta quantile
checks, redb/Postcard transactions, the dedicated writer, binary export/reset,
explicit schema refusal, the original CC0 corpus, and bounded manual speed overrides
are implemented. See [verification](../../../docs/session-verification.md) and
[tasks](tasks.md) for evidence rather than inferring completion from this document.

Physical output loopback, physical key timing, route comparisons and physical
display presentation remain unmeasured. Software input receipt/draw distributions
and native buffer/render/mapping results are recorded, including a 30-minute
combined typing/drawing/scoring/storage workload and a separately observed
CoreAudio underrun. The architecture permits explicitly unverified practice;
latency claims remain provisional. Tasks 1.2 and the physical portion of 8.1 stay
open. Application crash recovery tests do not prove physical power-loss behavior.

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
