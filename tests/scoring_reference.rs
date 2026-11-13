//! An exhaustive path enumerator independent of the production dynamic program.
use dih_dah_dojo::{
    scoring::{EditCounts, Outcome, align, live_alignment},
    transcript::Symbol,
};

#[derive(Clone)]
struct Path {
    cost: u32,
    counts: EditCounts,
    assignments: Vec<Option<usize>>,
}
fn enumerate(x: &[Symbol], y: &[Symbol], i: usize, j: usize, path: &mut Path, out: &mut Vec<Path>) {
    if i == x.len() && j == y.len() {
        out.push(path.clone());
        return;
    }
    if i < x.len() {
        path.assignments[i] = None;
        path.cost += 1;
        path.counts.omissions += 1;
        enumerate(x, y, i + 1, j, path, out);
        path.cost -= 1;
        path.counts.omissions -= 1;
    }
    if j < y.len() {
        path.cost += 1;
        path.counts.insertions += 1;
        enumerate(x, y, i, j + 1, path, out);
        path.cost -= 1;
        path.counts.insertions -= 1;
    }
    if i < x.len() && j < y.len() && y[j].at_ns >= x[i].at_ns {
        let penalty = u32::from(x[i].character != y[j].character);
        path.assignments[i] = Some(j);
        path.cost += penalty;
        path.counts.substitutions += penalty;
        enumerate(x, y, i + 1, j + 1, path, out);
        path.cost -= penalty;
        path.counts.substitutions -= penalty;
    }
}
fn strings() -> Vec<String> {
    let mut out = vec![String::new()];
    let mut level = out.clone();
    for _ in 0..4 {
        level = level
            .iter()
            .flat_map(|s| ['A', 'B'].map(|c| format!("{s}{c}")))
            .collect();
        out.extend(level.clone());
    }
    out
}
#[test]
fn scores_attribution_and_ranges_agree_with_every_short_alignment() {
    let strings = strings();
    for timed in [false, true] {
        for a in &strings {
            for b in &strings {
                let x: Vec<_> = a
                    .chars()
                    .enumerate()
                    .map(|(i, character)| Symbol {
                        character,
                        at_ns: if timed { i as u64 * 3 + 1 } else { 0 },
                    })
                    .collect();
                let y: Vec<_> = b
                    .chars()
                    .enumerate()
                    .map(|(j, character)| Symbol {
                        character,
                        at_ns: if timed { j as u64 * 2 } else { 0 },
                    })
                    .collect();
                let mut paths = Vec::new();
                enumerate(
                    &x,
                    &y,
                    0,
                    0,
                    &mut Path {
                        cost: 0,
                        counts: EditCounts::default(),
                        assignments: vec![None; x.len()],
                    },
                    &mut paths,
                );
                let best = paths.iter().map(|p| p.cost).min().unwrap();
                let best: Vec<_> = paths.iter().filter(|p| p.cost == best).collect();
                let actual = align(&x, &y, false).unwrap();
                let prefix_costs: Vec<_> = (0..=x.len())
                    .map(|i| align(&x[..i], &y, false).unwrap().distance)
                    .collect();
                let minimum = *prefix_costs.iter().min().unwrap();
                let frontier: Vec<_> = (0..=x.len())
                    .filter(|&i| prefix_costs[i] == minimum)
                    .collect();
                let live = live_alignment(&x, &y).unwrap();
                assert_eq!(
                    live.backlog_min as usize,
                    x.len() - frontier.last().unwrap()
                );
                assert_eq!(live.backlog_max as usize, x.len() - frontier[0]);
                assert_eq!(actual.distance, best[0].cost, "{a}->{b}, timed={timed}");
                let expected_accuracy =
                    (!x.is_empty()).then(|| (1.0 - best[0].cost as f64 / x.len() as f64).max(0.0));
                assert_eq!(actual.accuracy, expected_accuracy);
                for (i, target) in actual.outcomes.iter().enumerate() {
                    let first = best[0].assignments[i];
                    let expected = if best.iter().any(|p| p.assignments[i] != first) {
                        Outcome::Ambiguous
                    } else if let Some(response_index) = first {
                        if x[i].character == y[response_index].character {
                            Outcome::Matched { response_index }
                        } else {
                            Outcome::Substituted { response_index }
                        }
                    } else {
                        Outcome::Omitted
                    };
                    assert_eq!(
                        target.outcome, expected,
                        "{a}->{b} target {i}, timed={timed}"
                    );
                }
                for (observed, min_or_max) in [(actual.edits.min, false), (actual.edits.max, true)]
                {
                    for (field, value) in [
                        (0, observed.substitutions),
                        (1, observed.omissions),
                        (2, observed.insertions),
                    ] {
                        let values: Vec<_> = best
                            .iter()
                            .map(|p| match field {
                                0 => p.counts.substitutions,
                                1 => p.counts.omissions,
                                _ => p.counts.insertions,
                            })
                            .collect();
                        assert_eq!(
                            value,
                            if min_or_max {
                                *values.iter().max().unwrap()
                            } else {
                                *values.iter().min().unwrap()
                            }
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn optimized_live_error_attribution_matches_exact_prefix_scoring() {
    let mut seed = 19u64;
    for _ in 0..100 {
        let mut symbols = |n: usize| -> Vec<Symbol> {
            (0..n)
                .map(|i| {
                    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                    Symbol {
                        character: ['K', 'M', 'R'][(seed >> 32) as usize % 3],
                        at_ns: i as u64 * 10,
                    }
                })
                .collect()
        };
        let target = symbols(24);
        let mut response = symbols(22);
        for item in &mut response {
            item.at_ns += 25;
        }
        let prefixes: Vec<_> = (0..=target.len())
            .map(|i| align(&target[..i], &response, false).unwrap())
            .collect();
        let best = prefixes.iter().map(|p| p.distance).min().unwrap();
        let frontier: Vec<_> = prefixes
            .iter()
            .enumerate()
            .filter(|(_, p)| p.distance == best)
            .collect();
        let expected = if frontier.len() == 1 {
            let eligible: Vec<_> = frontier[0]
                .1
                .outcomes
                .iter()
                .rev()
                .filter(|o| o.outcome != Outcome::Ambiguous)
                .take(10)
                .collect();
            (eligible.len() == 10).then(|| {
                eligible
                    .iter()
                    .filter(|o| !matches!(o.outcome, Outcome::Matched { .. }))
                    .count() as u8
            })
        } else {
            None
        };
        assert_eq!(
            live_alignment(&target, &response).unwrap().latest_errors,
            expected
        );
    }
}
