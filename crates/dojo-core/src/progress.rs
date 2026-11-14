//! Pure presentation queries over durable records. No learner state is modified.
use crate::{
    learner::{Mode, POLICY},
    recording::{Kind, Record},
};

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Range {
    #[default]
    Thirty,
    Hundred,
    All,
}
impl Range {
    pub fn next(self) -> Self {
        match self {
            Self::Thirty => Self::Hundred,
            Self::Hundred => Self::All,
            Self::All => Self::Thirty,
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Thirty => "30",
            Self::Hundred => "100",
            Self::All => "all",
        }
    }
    fn limit(self) -> usize {
        match self {
            Self::Thirty => 30,
            Self::Hundred => 100,
            Self::All => usize::MAX,
        }
    }
}
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
pub struct Point {
    pub primary: f64,
    pub secondary: Option<f64>,
    pub milestone: bool,
    pub detail: Vec<String>,
}
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
pub struct Graph {
    pub title: String,
    pub primary_label: String,
    pub secondary_label: Option<String>,
    pub context: String,
    pub points: Vec<Point>,
    pub trend: Option<String>,
}
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
pub struct Character {
    pub symbol: char,
    pub introduced: bool,
    pub detail: Vec<String>,
}
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
pub struct ProgressData {
    pub range: Range,
    pub graphs: Vec<Graph>,
    pub characters: Vec<Character>,
    pub history: Vec<Vec<String>>,
}
/// Same independent-practice gate used by the existing descriptive trend queries.
pub(crate) fn independent_practice(r: &Record) -> bool {
    r.completed
        && r.compromised.is_none()
        && r.rescues == 0
        && !r.context.assisted
        && r.policy == POLICY
        && r.is_practice()
}
fn latency(r: &Record) -> Option<(f64, f64, usize)> {
    let mut samples: Vec<_> = r
        .observations
        .iter()
        .filter(|o| o.correct && !o.context.assisted)
        .filter_map(|o| o.latency_ns.filter(|n| *n >= 0))
        .collect();
    if samples.len() < 8 {
        return None;
    }
    samples.sort_unstable();
    let n = samples.len();
    Some((
        samples[(n - 1) / 2] as f64 / 1e6,
        samples[(9 * n).div_ceil(10) - 1] as f64 / 1e6,
        n,
    ))
}
fn conditions(r: &Record) -> String {
    format!(
        "{:?}/{:?} {}/{} WPM | repertoire {} | {} | corpus {}",
        r.context.mode,
        r.context.material,
        r.context.character_wpm,
        r.context.effective_wpm,
        r.repertoire,
        r.policy,
        r.corpus_version.as_deref().unwrap_or("none")
    )
}
pub fn history_detail(r: &Record) -> Vec<String> {
    let assisted = r.rescues > 0 || r.context.assisted || r.trials.iter().any(|t| t.assisted);
    vec![
        format!(
            "{} | {:?} | {} | {}",
            r.local_date,
            r.kind,
            if r.compromised.is_some() {
                "INTERRUPTED / TECHNICAL"
            } else if !r.completed {
                "INCOMPLETE"
            } else {
                "COMPLETE"
            },
            if assisted {
                "ASSISTED evidence present"
            } else {
                "INDEPENDENT"
            }
        ),
        conditions(r),
        format!(
            "Attempt {} | final {} | targets {} | independent observations {}",
            percent(r.metrics.attempt_accuracy),
            percent(r.metrics.final_accuracy),
            r.metrics.target_count,
            r.observations
                .iter()
                .filter(|o| !o.context.assisted)
                .count()
        ),
        r.pace_summary(),
        format!(
            "Catch-up gaps {} | {}",
            r.rescues,
            r.compromised
                .as_deref()
                .unwrap_or("no technical interruption")
        ),
        format!("Adaptation: {}", r.decision),
    ]
}
fn percent(v: Option<f64>) -> String {
    v.map_or_else(|| "unavailable".into(), |v| format!("{:.1}%", v * 100.0))
}
/// Graph preparation is called on entry/filter changes, never on each UI refresh.
pub fn prepare(records: &[Record], range: Range) -> ProgressData {
    let mut pace = Graph {
        title: "Copying pace / WPM".into(),
        primary_label: "requested C".into(),
        secondary_label: Some("requested E".into()),
        context: "Completed copying and checks; * paired verified check".into(),
        points: vec![],
        trend: None,
    };
    let eligible_pace: Vec<_> = records
        .iter()
        .enumerate()
        .rev()
        .filter(|(_, r)| {
            matches!(r.kind, Kind::Copying | Kind::Check) && r.completed && r.compromised.is_none()
        })
        .take(range.limit())
        .collect();
    let mut previous_repertoire: Option<&str> = None;
    for (i, r) in eligible_pace.into_iter().rev() {
        let milestone = r.qualifying_check()
            && records[..i].iter().any(|old| {
                old.qualifying_check() && old.local_date != r.local_date && old.comparable(r)
            });
        let mut detail = history_detail(r);
        if previous_repertoire.is_some_and(|previous| previous != r.repertoire) {
            detail.push(format!(
                "Repertoire changed from {} to {}",
                previous_repertoire.unwrap(),
                r.repertoire
            ));
        }
        if milestone {
            detail
                .push("VERIFIED: qualifying checks at these conditions on different dates".into());
        }
        previous_repertoire = Some(&r.repertoire);
        pace.points.push(Point {
            primary: r.context.character_wpm as f64,
            secondary: Some(r.context.effective_wpm as f64),
            milestone,
            detail,
        });
    }
    let accuracy = comparable_graph(records, range, false);
    let latency = comparable_graph(records, range, true);
    ProgressData {
        range,
        graphs: vec![pace, accuracy, latency],
        characters: vec![],
        history: records
            .iter()
            .rev()
            .filter(|r| {
                matches!(
                    r.kind,
                    Kind::Entry | Kind::Recognition | Kind::Copying | Kind::Check
                )
            })
            .take(range.limit())
            .map(history_detail)
            .collect(),
    }
}
fn comparable_graph(records: &[Record], range: Range, response_latency: bool) -> Graph {
    let eligible = |r: &&Record| {
        independent_practice(r)
            && if response_latency {
                r.context.mode == Mode::Recognition && latency(r).is_some()
            } else {
                r.metrics.attempt_accuracy.is_some()
            }
    };
    let latest = records.iter().rev().find(eligible);
    let mut graph = Graph {
        title: if response_latency {
            "Latency / ms (typing)"
        } else {
            "Attempt accuracy / %"
        }
        .into(),
        primary_label: if response_latency {
            "median"
        } else {
            "attempt"
        }
        .into(),
        secondary_label: response_latency.then(|| "p90".into()),
        context: latest.map_or_else(|| "No eligible observed context yet".into(), conditions),
        points: vec![],
        trend: None,
    };
    let Some(latest) = latest else {
        return graph;
    };
    let selected: Vec<_> = records
        .iter()
        .rev()
        .filter(eligible)
        .filter(|r| r.comparable(latest))
        .take(range.limit())
        .collect();
    for r in selected.into_iter().rev() {
        let mut detail = history_detail(r);
        let (primary, secondary) = if response_latency {
            let (median, p90, n) = latency(r).unwrap();
            detail.push(format!("Typing-inclusive latency: median {median:.0} ms | p90 {p90:.0} ms | n={n} correct independent nonnegative responses"));
            (median, Some(p90))
        } else {
            (r.metrics.attempt_accuracy.unwrap() * 100.0, None)
        };
        graph.points.push(Point {
            primary,
            secondary,
            milestone: false,
            detail,
        });
    }
    // Retain the existing six comparable blocks minimum for descriptive trends.
    if graph.points.len() >= 6 {
        let tail = &graph.points[graph.points.len() - 6..];
        let delta = tail[3..].iter().map(|p| p.primary).sum::<f64>() / 3.0
            - tail[..3].iter().map(|p| p.primary).sum::<f64>() / 3.0;
        graph.trend = Some(format!(
            "Descriptive change {delta:+.1} {} (3 blocks vs 3)",
            if response_latency {
                "ms, typing included"
            } else {
                "percentage points"
            }
        ));
    }
    graph
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::learner::{Context, Material, Observation};
    fn practice(context: Context, n: usize) -> Record {
        let mut r = Record::new(
            "graph-fixture",
            context,
            if context.mode == Mode::Recognition {
                Kind::Recognition
            } else {
                Kind::Copying
            },
        );
        r.completed = true;
        r.local_date = "2026-11-14".into();
        r.repertoire = "KM".into();
        r.metrics.attempt_accuracy = Some(0.95);
        r.metrics.final_accuracy = Some(1.0);
        r.metrics.target_count = n as u32;
        r.observations = (0..n)
            .map(|i| Observation {
                symbol: 'K',
                context,
                correct: true,
                response: Some('K'),
                latency_ns: Some((i as i64 + 1) * 1_000_000),
                utc_ms: 0,
                local_date: r.local_date.clone(),
            })
            .collect();
        r
    }
    #[test]
    fn graphs_choose_latest_eligible_observed_context_and_do_not_mix_conditions() {
        let base = practice(Context::copying(20, 5, Material::Groups), 10);
        let mut records = vec![base.clone(); 6];
        let newer = practice(Context::copying(20, 6, Material::Text), 10);
        records.push(newer.clone());
        for variant in 0..7 {
            let mut excluded = newer.clone();
            match variant {
                0 => excluded.completed = false,
                1 => excluded.compromised = Some("fault".into()),
                2 => excluded.rescues = 1,
                3 => excluded.context.assisted = true,
                4 => excluded.policy = "old-policy".into(),
                5 => excluded.kind = Kind::Check,
                _ => excluded.metrics.attempt_accuracy = None,
            };
            excluded.context.character_wpm = 30;
            records.push(excluded);
        }
        let graph = &prepare(&records, Range::All).graphs[1];
        assert_eq!(graph.points.len(), 1);
        assert!(graph.context.contains("20/6 WPM"));
        assert!(graph.trend.is_none());
        let mut changed = newer.clone();
        changed.repertoire = "KMR".into();
        records.push(changed.clone());
        assert_eq!(prepare(&records, Range::All).graphs[1].points.len(), 1);
        changed.corpus_version = Some("new-corpus".into());
        records.push(changed);
        assert_eq!(prepare(&records, Range::All).graphs[1].points.len(), 1);
        assert!(
            prepare(&records, Range::All)
                .history
                .iter()
                .any(|d| d[0].contains("INTERRUPTED"))
        );
        assert!(
            prepare(&records, Range::All)
                .history
                .iter()
                .any(|d| d[0].contains("ASSISTED"))
        );
    }
    #[test]
    fn latency_uses_eight_correct_independent_nonnegative_samples_and_nearest_rank() {
        let base = practice(Context::recognition(20), 8);
        let mut newer = practice(Context::recognition(21), 7);
        let mut records = vec![base.clone(), newer.clone()];
        assert!(
            prepare(&records, Range::All).graphs[2]
                .context
                .contains("20/0 WPM")
        );
        newer.observations.push(Observation {
            latency_ns: Some(-1),
            ..base.observations[0].clone()
        });
        records.push(newer.clone());
        assert!(
            prepare(&records, Range::All).graphs[2]
                .context
                .contains("20/0 WPM")
        );
        newer.observations.last_mut().unwrap().latency_ns = Some(999_000_000);
        newer.observations.last_mut().unwrap().context.assisted = true;
        records.push(newer.clone());
        assert!(
            prepare(&records, Range::All).graphs[2]
                .context
                .contains("20/0 WPM")
        );
        newer.observations.last_mut().unwrap().context.assisted = false;
        newer.observations.last_mut().unwrap().correct = false;
        records.push(newer.clone());
        assert!(
            prepare(&records, Range::All).graphs[2]
                .context
                .contains("20/0 WPM")
        );
        newer.observations.last_mut().unwrap().correct = true;
        records.push(newer);
        let data = prepare(&records, Range::All);
        assert!(data.graphs[2].context.contains("21/0 WPM"));
        let point = &data.graphs[2].points[0];
        assert_eq!(point.primary, 4.0);
        assert_eq!(point.secondary, Some(999.0));
        assert!(point.detail.iter().any(|s| s.contains("n=8")));
    }
    #[test]
    fn ranges_keep_actual_points_and_trends_retain_six_block_minimum() {
        let base = practice(Context::recognition(20), 8);
        let records = vec![base; 120];
        for (range, n) in [
            (Range::Thirty, 30),
            (Range::Hundred, 100),
            (Range::All, 120),
        ] {
            assert_eq!(prepare(&records, range).graphs[1].points.len(), n);
            assert_eq!(prepare(&records, range).graphs[2].points.len(), n);
        }
        assert!(prepare(&records[..5], Range::All).graphs[1].trend.is_none());
        assert!(prepare(&records[..6], Range::All).graphs[1].trend.is_some());
        assert!(
            prepare(&[], Range::All)
                .graphs
                .iter()
                .all(|g| g.points.is_empty() && g.trend.is_none())
        );
    }
    #[test]
    fn pace_markers_require_existing_paired_check_rules_and_show_repertoire_changes() {
        let mut first = practice(Context::copying(20, 5, Material::Groups), 100);
        first.kind = Kind::Check;
        first.assessment_elapsed_ns = 180_000_000_000;
        first.local_date = "2026-11-13".into();
        let mut second = first.clone();
        second.local_date = "2026-11-14".into();
        let mut changed = second.clone();
        changed.repertoire = "KMR".into();
        let data = prepare(&[first, second, changed], Range::All);
        assert!(!data.graphs[0].points[0].milestone);
        assert!(data.graphs[0].points[1].milestone);
        assert!(!data.graphs[0].points[2].milestone);
        assert!(
            data.graphs[0].points[2]
                .detail
                .iter()
                .any(|s| s.contains("Repertoire changed"))
        );
    }
}
