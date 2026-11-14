//! Shared assessment eligibility and descriptive history queries.
use crate::{
    learner::{Context, Profile},
    recording::Record,
};
pub fn milestones(records: &[Record]) -> Vec<String> {
    let mut out = Vec::new();
    for (i, current) in records
        .iter()
        .enumerate()
        .filter(|(_, r)| r.qualifying_check())
    {
        if records[..i].iter().any(|old| {
            old.qualifying_check()
                && old.comparable(current)
                && old.local_date != current.local_date
        }) {
            let text = format!(
                "{}/{} WPM {:?}, repertoire {}, verified on different dates",
                current.context.character_wpm,
                current.context.effective_wpm,
                current.context.material,
                current.repertoire
            );
            if !out.contains(&text) {
                out.push(text);
            }
        }
    }
    out
}
fn comparable_records(records: &[Record], context: Context) -> Vec<&Record> {
    let mut comparable: Vec<_> = records
        .iter()
        .rev()
        .filter(|r| r.context == context && crate::progress::independent_practice(r))
        .collect();
    if let Some(latest) = comparable.first().copied() {
        comparable.retain(|r| r.comparable(latest));
    }
    comparable
}
pub fn trend(records: &[Record], context: Context) -> Option<f64> {
    let values: Vec<_> = comparable_records(records, context)
        .into_iter()
        .filter_map(|r| r.metrics.attempt_accuracy)
        .take(6)
        .collect();
    (values.len() == 6)
        .then(|| values[..3].iter().sum::<f64>() / 3.0 - values[3..].iter().sum::<f64>() / 3.0)
}
/// Difference between means of three comparable block medians (latest minus previous).
/// At least eight correct independent nonnegative responses are needed in each block.
pub fn latency_trend(records: &[Record], context: Context) -> Option<i64> {
    let values: Vec<_> = comparable_records(records, context)
        .into_iter()
        .filter_map(|r| {
            let mut delays: Vec<_> = r
                .observations
                .iter()
                .filter(|o| o.correct && !o.context.assisted)
                .filter_map(|o| o.latency_ns.filter(|v| *v >= 0))
                .collect();
            if delays.len() < 8 {
                return None;
            }
            delays.sort_unstable();
            Some(delays[(delays.len() - 1) / 2] as i128)
        })
        .take(6)
        .collect();
    (values.len() == 6).then(|| {
        ((values[..3].iter().sum::<i128>() - values[3..].iter().sum::<i128>()) / 3)
            .clamp(i64::MIN as i128, i64::MAX as i128) as i64
    })
}
pub fn check_context(
    profile: &Profile,
    records: &[Record],
    date: &str,
) -> Option<(Context, String)> {
    if profile.sessions < 3 || profile.offered_dates.contains(date) {
        return None;
    }
    // Repeat an unpaired successful check at identical conditions before chasing a higher target.
    if let Some(old) = records.iter().rev().find(|r| {
        r.qualifying_check()
            && r.policy == crate::learner::POLICY
            && r.context.character_wpm <= profile.copying_c
            && r.context.effective_wpm <= profile.copying_e
            && (r.context.material != crate::learner::Material::Text
                || r.corpus_version.as_deref() == Some(crate::planner::CORPUS_VERSION))
            && r.local_date != date
            && !records.iter().any(|other| {
                other.qualifying_check() && other.local_date != r.local_date && other.comparable(r)
            })
    }) {
        return Some((old.context, old.repertoire.clone()));
    }
    profile
        .check_qualifications
        .iter()
        .filter(|((c, e, _), count)| {
            **count >= 2 && *c <= profile.copying_c && *e <= profile.copying_e
        })
        .max_by_key(|((c, e, _), _)| (*e, *c))
        .map(|((c, e, material), _)| {
            (
                Context::copying(*c, *e, *material),
                canonical_repertoire(&profile.introduced),
            )
        })
}
pub fn canonical_repertoire(text: &str) -> String {
    crate::timing::SYMBOLS
        .chars()
        .filter(|c| text.contains(*c))
        .collect()
}
