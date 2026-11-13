//! Exact, onset-gated copying scores and agreement across every optimal alignment.
//! This is worker-thread computation and must never execute in an audio callback.
use crate::{
    timing::pattern,
    transcript::{MAX_INPUT_EVENTS, Symbol},
};
use std::fmt;

/// Limits the full DP matrix to 16 MiB, plus traversal/range working memory.
pub const MAX_ALIGNMENT_CELLS: usize = 4_194_304;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScoreError {
    InvalidSymbol(char),
    NonMonotonicTime,
    TooLarge,
    AllocationFailed,
}
impl fmt::Display for ScoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSymbol(c) => write!(f, "unsupported scoring symbol: {c}"),
            Self::NonMonotonicTime => f.write_str("symbol timestamps must not go backwards"),
            Self::TooLarge => f.write_str(
                "alignment exceeds the scorer's resource limit; do not report a partial score",
            ),
            Self::AllocationFailed => f.write_str("unable to allocate scoring workspace"),
        }
    }
}
impl std::error::Error for ScoreError {}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct EditCounts {
    pub substitutions: u32,
    pub omissions: u32,
    pub insertions: u32,
}
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct EditRanges {
    pub min: EditCounts,
    pub max: EditCounts,
}
impl EditRanges {
    fn increment(mut self, operation: Operation) -> Self {
        for c in [&mut self.min, &mut self.max] {
            match operation {
                Operation::Substitute => c.substitutions += 1,
                Operation::Omit => c.omissions += 1,
                Operation::Insert => c.insertions += 1,
                Operation::Match => {}
            }
        }
        self
    }
    fn merge(&mut self, other: Self) {
        self.min.substitutions = self.min.substitutions.min(other.min.substitutions);
        self.min.omissions = self.min.omissions.min(other.min.omissions);
        self.min.insertions = self.min.insertions.min(other.min.insertions);
        self.max.substitutions = self.max.substitutions.max(other.max.substitutions);
        self.max.omissions = self.max.omissions.max(other.max.omissions);
        self.max.insertions = self.max.insertions.max(other.max.insertions);
    }
}
#[derive(Clone, Copy)]
enum Operation {
    Match,
    Substitute,
    Omit,
    Insert,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Matched { response_index: usize },
    Substituted { response_index: usize },
    Omitted,
    Ambiguous,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TargetOutcome {
    /// Indices always refer to the original input slices, including removed spaces.
    pub target_index: usize,
    pub target: Symbol,
    pub outcome: Outcome,
}
#[derive(Debug)]
pub struct AlignmentScore {
    pub target_count: usize,
    pub response_count: usize,
    pub distance: u32,
    pub accuracy: Option<f64>,
    /// Marginal ranges; their minima/maxima need not occur on the same path.
    pub edits: EditRanges,
    pub outcomes: Vec<TargetOutcome>,
}
#[derive(Debug)]
pub struct CopyScore {
    pub primary: AlignmentScore,
    pub including_spaces: AlignmentScore,
}
#[derive(Clone, Copy)]
struct Indexed {
    symbol: Symbol,
    index: usize,
}

fn normalize(input: &[Symbol], spaces: bool) -> Result<Vec<Indexed>, ScoreError> {
    if input.len() > MAX_INPUT_EVENTS {
        return Err(ScoreError::TooLarge);
    }
    if input.windows(2).any(|p| p[0].at_ns > p[1].at_ns) {
        return Err(ScoreError::NonMonotonicTime);
    }
    let mut out: Vec<Indexed> = Vec::new();
    for (index, item) in input.iter().enumerate() {
        let character = if item.character.is_ascii_whitespace() {
            ' '
        } else {
            item.character.to_ascii_uppercase()
        };
        if character != ' ' && pattern(character).is_none() {
            return Err(ScoreError::InvalidSymbol(item.character));
        }
        if character == ' '
            && (!spaces || out.is_empty() || out.last().is_some_and(|v| v.symbol.character == ' '))
        {
            continue;
        }
        out.push(Indexed {
            symbol: Symbol {
                character,
                at_ns: item.at_ns,
            },
            index,
        });
    }
    if out.last().is_some_and(|v| v.symbol.character == ' ') {
        out.pop();
    }
    Ok(out)
}
fn diagonal_allowed(a: Indexed, b: Indexed) -> bool {
    a.symbol.character == ' ' || b.symbol.character == ' ' || b.symbol.at_ns >= a.symbol.at_ns
}

/// Both inputs use the same monotonic origin; untimed fixtures can use zero for all times.
pub fn score_copy(target: &[Symbol], response: &[Symbol]) -> Result<CopyScore, ScoreError> {
    // Compute sequentially: only one full DP matrix is resident at a time.
    Ok(CopyScore {
        primary: align(target, response, false)?,
        including_spaces: align(target, response, true)?,
    })
}

/// `spaces=false` scores Morse characters. `true` additionally scores normalized spaces.
pub fn align(
    target: &[Symbol],
    response: &[Symbol],
    spaces: bool,
) -> Result<AlignmentScore, ScoreError> {
    let x = normalize(target, spaces)?;
    let y = normalize(response, spaces)?;
    let (n, m) = (x.len(), y.len());
    let width = m + 1;
    let cells = (n + 1)
        .checked_mul(width)
        .filter(|&v| v <= MAX_ALIGNMENT_CELLS)
        .ok_or(ScoreError::TooLarge)?;
    let mut costs = Vec::new();
    costs
        .try_reserve_exact(cells)
        .map_err(|_| ScoreError::AllocationFailed)?;
    costs.resize(cells, 0u32);
    let mut previous = vec![EditRanges::default(); width];
    let mut current = previous.clone();
    for j in 0..=m {
        costs[j] = j as u32;
        previous[j] = EditRanges {
            min: EditCounts {
                insertions: j as u32,
                ..EditCounts::default()
            },
            max: EditCounts {
                insertions: j as u32,
                ..EditCounts::default()
            },
        };
    }
    for i in 1..=n {
        let row = i * width;
        costs[row] = i as u32;
        current[0] = EditRanges {
            min: EditCounts {
                omissions: i as u32,
                ..EditCounts::default()
            },
            max: EditCounts {
                omissions: i as u32,
                ..EditCounts::default()
            },
        };
        for j in 1..=m {
            let omit = costs[row - width + j] + 1;
            let insert = costs[row + j - 1] + 1;
            let equal = x[i - 1].symbol.character == y[j - 1].symbol.character;
            let diagonal = if diagonal_allowed(x[i - 1], y[j - 1]) {
                costs[row - width + j - 1] + u32::from(!equal)
            } else {
                u32::MAX
            };
            let best = omit.min(insert).min(diagonal);
            costs[row + j] = best;
            let mut range = None::<EditRanges>;
            for (candidate, stats, operation) in [
                (omit, previous[j], Operation::Omit),
                (insert, current[j - 1], Operation::Insert),
                (
                    diagonal,
                    previous[j - 1],
                    if equal {
                        Operation::Match
                    } else {
                        Operation::Substitute
                    },
                ),
            ] {
                if candidate == best {
                    let value = stats.increment(operation);
                    if let Some(existing) = range.as_mut() {
                        existing.merge(value);
                    } else {
                        range = Some(value);
                    }
                }
            }
            current[j] = range.expect("at least one finite edit path");
        }
        std::mem::swap(&mut current, &mut previous);
    }
    let distance = costs[cells - 1];
    let edits = previous[m];
    // Every predecessor has a smaller flattened index: a reverse scan visits the DAG
    // without path enumeration, recursion, or an exponentially large traceback list.
    let mut reachable = vec![false; cells];
    reachable[cells - 1] = true;
    let mut assignments: Vec<Option<Outcome>> = vec![None; n];
    for cell in (1..cells).rev() {
        if !reachable[cell] {
            continue;
        }
        let (i, j) = (cell / width, cell % width);
        if i > 0 && costs[cell - width] + 1 == costs[cell] {
            reachable[cell - width] = true;
            agree(&mut assignments[i - 1], Outcome::Omitted);
        }
        if j > 0 && costs[cell - 1] + 1 == costs[cell] {
            reachable[cell - 1] = true;
        }
        if i > 0 && j > 0 && diagonal_allowed(x[i - 1], y[j - 1]) {
            let equal = x[i - 1].symbol.character == y[j - 1].symbol.character;
            if costs[cell - width - 1] + u32::from(!equal) == costs[cell] {
                reachable[cell - width - 1] = true;
                let response_index = y[j - 1].index;
                agree(
                    &mut assignments[i - 1],
                    if equal {
                        Outcome::Matched { response_index }
                    } else {
                        Outcome::Substituted { response_index }
                    },
                );
            }
        }
    }
    let outcomes = x
        .iter()
        .zip(assignments)
        .map(|(x, outcome)| TargetOutcome {
            target_index: x.index,
            target: x.symbol,
            outcome: outcome.expect("each target lies on an optimal path"),
        })
        .collect();
    Ok(AlignmentScore {
        target_count: n,
        response_count: m,
        distance,
        accuracy: (n > 0).then(|| (1.0 - distance as f64 / n as f64).max(0.0)),
        edits,
        outcomes,
    })
}
fn agree(current: &mut Option<Outcome>, candidate: Outcome) {
    match current {
        None => *current = Some(candidate),
        Some(old) if *old != candidate => *old = Outcome::Ambiguous,
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcript::{Edit, Transcript};
    fn symbols(text: &str) -> Vec<Symbol> {
        text.chars()
            .map(|character| Symbol {
                character,
                at_ns: 0,
            })
            .collect()
    }
    #[test]
    fn golden_distance_and_accuracy_examples() {
        for (x, y, d, a) in [
            ("AB", "AXB", 1, 0.5),
            ("ABCDE", "ABDE", 1, 0.8),
            ("AAA", "AA", 1, 2.0 / 3.0),
            ("AB", "XXXXAB", 4, 0.0),
            ("AB", "AB", 0, 1.0),
            ("AB", "", 2, 0.0),
        ] {
            let result = align(&symbols(x), &symbols(y), false).unwrap();
            assert_eq!(result.distance, d, "{x}->{y}");
            assert!((result.accuracy.unwrap() - a).abs() < 1e-12);
        }
        let empty = align(&[], &symbols("A"), false).unwrap();
        assert_eq!(empty.accuracy, None);
        assert_eq!(empty.edits.min.insertions, 1);
    }
    #[test]
    fn corrected_final_keeps_its_later_timestamp() {
        let mut t = Transcript::default();
        for (i, edit) in [
            Edit::Type('A'),
            Edit::Type('X'),
            Edit::Backspace,
            Edit::Type('B'),
        ]
        .into_iter()
        .enumerate()
        {
            t.record(edit, i as u64).unwrap();
        }
        let x = symbols("AB");
        assert_eq!(
            score_copy(&x, t.attempts()).unwrap().primary.accuracy,
            Some(0.5)
        );
        assert_eq!(
            score_copy(&x, t.final_text()).unwrap().primary.accuracy,
            Some(1.0)
        );
    }
    #[test]
    fn ambiguity_preserves_possible_outcomes_instead_of_guessing() {
        let result = align(&symbols("AAA"), &symbols("AA"), false).unwrap();
        assert!(
            result
                .outcomes
                .iter()
                .all(|v| v.outcome == Outcome::Ambiguous)
        );
        assert_eq!(result.edits.min.omissions, 1);
        assert_eq!(result.edits.max.omissions, 1);
        let unique = align(&symbols("ABCDE"), &symbols("ABDE"), false).unwrap();
        assert_eq!(unique.outcomes[2].outcome, Outcome::Omitted);
        assert_eq!(
            unique.outcomes[3].outcome,
            Outcome::Matched { response_index: 2 }
        );
    }
    #[test]
    fn alternative_edit_counts_are_reported_as_marginal_ranges() {
        let r = align(&symbols("AB"), &symbols("BA"), false).unwrap();
        assert_eq!(r.distance, 2);
        assert_eq!(r.edits.min, EditCounts::default());
        assert_eq!(
            r.edits.max,
            EditCounts {
                substitutions: 2,
                omissions: 1,
                insertions: 1
            }
        );
    }
    #[test]
    fn response_before_onset_cannot_earn_diagonal_credit() {
        let target = [Symbol {
            character: 'A',
            at_ns: 10,
        }];
        let early = [Symbol {
            character: 'A',
            at_ns: 9,
        }];
        let r = align(&target, &early, false).unwrap();
        assert_eq!(r.distance, 2);
        assert_eq!(r.accuracy, Some(0.0));
        assert_eq!(r.outcomes[0].outcome, Outcome::Omitted);
        assert_eq!(
            align(
                &target,
                &[Symbol {
                    character: 'A',
                    at_ns: 10
                }],
                false
            )
            .unwrap()
            .distance,
            0
        );
    }
    #[test]
    fn spacing_normalization_keeps_original_response_indices() {
        let x = symbols("  a b\n");
        let y = symbols(" AB ");
        let r = score_copy(&x, &y).unwrap();
        assert_eq!(r.primary.accuracy, Some(1.0));
        assert_eq!(r.including_spaces.distance, 1);
        assert_eq!(r.primary.outcomes[1].target_index, 4);
        assert_eq!(
            r.primary.outcomes[1].outcome,
            Outcome::Matched { response_index: 2 }
        );
        assert_eq!(
            align(&symbols("A \t B"), &symbols("a b"), true)
                .unwrap()
                .distance,
            0
        );
    }
    #[test]
    fn invalid_and_pathological_inputs_are_explicit_errors() {
        assert!(matches!(
            align(&symbols("@"), &[], false),
            Err(ScoreError::InvalidSymbol('@'))
        ));
        let unordered = [
            Symbol {
                character: 'A',
                at_ns: 2,
            },
            Symbol {
                character: 'B',
                at_ns: 1,
            },
        ];
        assert!(matches!(
            align(&unordered, &[], false),
            Err(ScoreError::NonMonotonicTime)
        ));
        let large = symbols(&"A".repeat(3000));
        assert!(matches!(
            align(&large, &large, false),
            Err(ScoreError::TooLarge)
        ));
    }
}

/// Live prefix evidence, computed only from characters already completed and input
/// already captured. The input is the editable final transcript, not future text.
#[derive(Debug, Clone, Copy)]
pub struct LiveAlignment {
    pub backlog_min: u32,
    pub backlog_max: u32,
    pub latest_errors: Option<u8>,
}
pub fn live_alignment(target: &[Symbol], response: &[Symbol]) -> Result<LiveAlignment, ScoreError> {
    let x = normalize(target, false)?;
    let y = normalize(response, false)?;
    if (x.len() + 1)
        .checked_mul(y.len() + 1)
        .is_none_or(|cells| cells > MAX_ALIGNMENT_CELLS)
    {
        return Err(ScoreError::TooLarge);
    }
    let mut previous: Vec<u32> = (0..=y.len() as u32).collect();
    let mut current = vec![0; y.len() + 1];
    let mut best = previous[y.len()];
    let mut first = 0usize;
    let mut last = 0usize;
    for i in 1..=x.len() {
        current[0] = i as u32;
        for j in 1..=y.len() {
            let diagonal = if diagonal_allowed(x[i - 1], y[j - 1]) {
                previous[j - 1] + u32::from(x[i - 1].symbol.character != y[j - 1].symbol.character)
            } else {
                u32::MAX
            };
            current[j] = (previous[j] + 1).min(current[j - 1] + 1).min(diagonal);
        }
        let cost = current[y.len()];
        if cost < best {
            best = cost;
            first = i;
            last = i;
        } else if cost == best {
            last = i;
        }
        std::mem::swap(&mut previous, &mut current);
    }
    let latest_errors = if first == last {
        let end = if last == 0 { 0 } else { x[last - 1].index + 1 };
        let prefix = align(&target[..end], response, false)?;
        let eligible: Vec<_> = prefix
            .outcomes
            .iter()
            .rev()
            .filter(|v| v.outcome != Outcome::Ambiguous)
            .take(10)
            .collect();
        (eligible.len() == 10).then(|| {
            eligible
                .iter()
                .filter(|v| !matches!(v.outcome, Outcome::Matched { .. }))
                .count() as u8
        })
    } else {
        None
    };
    Ok(LiveAlignment {
        backlog_min: (x.len() - last) as u32,
        backlog_max: (x.len() - first) as u32,
        latest_errors,
    })
}

#[cfg(test)]
mod live_tests {
    use super::*;
    fn symbols(s: &str) -> Vec<Symbol> {
        s.chars()
            .map(|character| Symbol {
                character,
                at_ns: 0,
            })
            .collect()
    }
    #[test]
    fn live_frontier_can_rejoin_after_an_omission() {
        let lag = live_alignment(&symbols("ABCDE"), &symbols("AB")).unwrap();
        assert_eq!((lag.backlog_min, lag.backlog_max), (3, 3));
        let rejoined = live_alignment(&symbols("ABCDE"), &symbols("ABDE")).unwrap();
        assert_eq!(rejoined.backlog_min, 0);
        let no_input = live_alignment(&symbols("ABCDE"), &[]).unwrap();
        assert_eq!(no_input.backlog_min, 5);
        assert_eq!(no_input.latest_errors, None);
    }
    #[test]
    fn live_errors_require_ten_attributable_outcomes() {
        assert_eq!(
            live_alignment(&symbols("ABCDEFGHIJ"), &symbols("ABCDEFGHIJ"))
                .unwrap()
                .latest_errors,
            Some(0)
        );
        assert_eq!(
            live_alignment(&symbols("ABC"), &symbols("ABC"))
                .unwrap()
                .latest_errors,
            None
        );
    }
}
