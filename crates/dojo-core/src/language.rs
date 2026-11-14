//! Independent language activities. Never updates the adaptive learner.
use crate::{
    planner::Random,
    scoring,
    timing::{Schedule, Timing, pattern},
    transcript::Symbol,
};
use serde::{Deserialize, Serialize};
pub const VERSION: u8 = 1;
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Item {
    pub id: String,
    pub text: String,
    pub meaning: String,
    pub set: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Story {
    pub id: String,
    pub title: String,
    pub sentences: Vec<String>,
}
pub fn words() -> Vec<Item> {
    include_str!("../../../assets/words.tsv")
        .lines()
        .filter(|l| !l.starts_with('#'))
        .map(|l| {
            let fields: Vec<_> = l.split('\t').collect();
            Item {
                id: format!("{}-{}", fields[1], fields[0]),
                text: fields[0].into(),
                set: fields[1].into(),
                meaning: fields[2].into(),
            }
        })
        .collect()
}
pub fn stories() -> Vec<Story> {
    include_str!("../../../assets/stories.tsv")
        .lines()
        .filter(|l| !l.starts_with('#'))
        .map(|l| {
            let f: Vec<_> = l.split('\t').collect();
            Story {
                id: f[0].into(),
                title: f[1].into(),
                sentences: f[2].split('|').map(str::to_owned).collect(),
            }
        })
        .collect()
}
pub fn select(repertoire: &str, set: &str, min: usize, max: usize, seed: u64) -> Vec<Item> {
    let mut items: Vec<_> = words()
        .into_iter()
        .filter(|w| {
            w.set == set
                && w.text.len() >= min
                && w.text.len() <= max
                && w.text.chars().all(|c| repertoire.contains(c))
        })
        .collect();
    let mut rng = Random::new(seed);
    for i in (1..items.len()).rev() {
        let j = rng.next_u64() as usize % (i + 1);
        items.swap(i, j);
    }
    items.truncate(10);
    items
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Activity {
    pub version: u8,
    pub id: String,
    pub item: String,
    pub sentence: usize,
    pub kind: String,
    pub input: String,
    pub c: f64,
    pub e: f64,
    pub answer: Option<String>,
    pub attempts: Vec<String>,
    pub replay: bool,
    pub revealed: bool,
    pub review: bool,
    pub interrupted: bool,
    pub finished: bool,
    pub self_report: Option<bool>,
    pub created: i64,
}
#[derive(Serialize, Deserialize)]
pub struct Outcome {
    pub eligible: bool,
    pub correct: Option<bool>,
    pub attempt_accuracy: Option<f64>,
    pub final_accuracy: Option<f64>,
}
pub fn evaluate(a: &Activity) -> Result<Outcome, String> {
    if a.version != VERSION
        || a.id.is_empty()
        || a.id.len() > 100
        || !["keyboard", "touch"].contains(&a.input.as_str())
        || !["word", "story"].contains(&a.kind.as_str())
        || a.attempts.len() > 512
        || a.attempts.iter().any(|s| s.len() > 512)
        || a.answer.as_ref().is_some_and(|s| s.len() > 512)
    {
        return Err("Invalid activity".into());
    }
    let text = if a.kind == "word" {
        words().into_iter().find(|w| w.id == a.item).map(|w| w.text)
    } else {
        stories()
            .into_iter()
            .find(|s| s.id == a.item)
            .and_then(|s| s.sentences.get(a.sentence).cloned())
    }
    .ok_or("Unknown content version or item")?;
    Schedule::compile(
        &text,
        Timing::new(a.c, a.e).map_err(|e| e.to_string())?,
        48000,
    )
    .map_err(|e| e.to_string())?;
    let eligible =
        a.finished && !a.interrupted && !a.replay && !a.revealed && !a.review && a.answer.is_some();
    let answer = a
        .answer
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    if !answer.chars().all(|c| c == ' ' || pattern(c).is_some()) {
        return Err("Unsupported answer".into());
    }
    let score = |s: &str| -> Result<Option<f64>, String> {
        let symbols = |s: &str| {
            s.chars()
                .map(|character| Symbol {
                    character,
                    at_ns: 0,
                })
                .collect::<Vec<_>>()
        };
        Ok(scoring::score_copy(&symbols(&text), &symbols(s))
            .map_err(|e| e.to_string())?
            .primary
            .accuracy)
    };
    // Recover the append-only attempt stream from tail-edit snapshots.
    let mut previous = String::new();
    let mut attempt = String::new();
    for edit in &a.attempts {
        let current = edit.to_ascii_uppercase();
        if current.starts_with(&previous) {
            attempt.push_str(&current[previous.len()..]);
        } else if !previous.starts_with(&current) {
            return Err("Only tail editing is supported".into());
        }
        previous = current;
    }
    if a.attempts.is_empty() {
        attempt = answer.clone();
    } else if previous.trim() != answer && a.answer.is_some() {
        return Err("Answer and input stream differ".into());
    }
    Ok(Outcome {
        eligible,
        correct: a.answer.as_ref().map(|_| answer == text),
        attempt_accuracy: if a.answer.is_some() {
            score(&attempt)?
        } else {
            None
        },
        final_accuracy: if a.answer.is_some() {
            score(&answer)?
        } else {
            None
        },
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalogs_are_valid_and_assessment_is_reserved() {
        let w = words();
        assert!(w.iter().filter(|w| w.set == "words").count() >= 100);
        assert!(w.iter().filter(|w| w.set == "radio").count() >= 20);
        let mut ids = std::collections::HashSet::new();
        for w in w {
            assert!(ids.insert(w.id));
            assert!(w.text.chars().all(|c| pattern(c).is_some()));
        }
        let s = stories();
        assert_eq!(s.len(), 6);
        for story in s {
            for sentence in story.sentences {
                assert!(sentence.chars().all(|c| c == ' ' || pattern(c).is_some()));
                assert!(
                    !crate::planner::corpus()
                        .into_iter()
                        .filter(|p| p.check)
                        .any(|p| p.text.contains(&sentence))
                );
            }
        }
    }
    #[test]
    fn assistance_and_tail_corrections_preserve_attempt_evidence() {
        let mut a = Activity {
            version: 1,
            id: "trial".into(),
            item: "words-AN".into(),
            sentence: 0,
            kind: "word".into(),
            input: "keyboard".into(),
            c: 20.0,
            e: 10.0,
            answer: Some("AN".into()),
            attempts: vec!["A".into(), "AX".into(), "A".into(), "AN".into()],
            replay: false,
            revealed: false,
            review: false,
            interrupted: false,
            finished: true,
            self_report: None,
            created: 0,
        };
        let result = evaluate(&a).unwrap();
        assert!(result.eligible);
        assert_eq!(result.correct, Some(true));
        assert!(result.attempt_accuracy.unwrap() < result.final_accuracy.unwrap());
        a.replay = true;
        assert!(!evaluate(&a).unwrap().eligible);
        a.replay = false;
        a.review = true;
        assert!(!evaluate(&a).unwrap().eligible);
        a.review = false;
        a.interrupted = true;
        assert!(!evaluate(&a).unwrap().eligible);
        a.interrupted = false;
        a.attempts.clear();
        a.answer = Some("A N".into());
        assert_eq!(evaluate(&a).unwrap().correct, Some(false));
        a.answer = None;
        assert_eq!(evaluate(&a).unwrap().correct, None);
    }
    #[test]
    fn selection_is_bounded_unique_and_seeded() {
        let a = select("KM", "words", 2, 3, 1);
        assert!(a.is_empty());
        let a = select("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "words", 2, 3, 42);
        assert_eq!(a.len(), 10);
        assert_eq!(
            a.iter().map(|w| &w.id).collect::<Vec<_>>(),
            select("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "words", 2, 3, 42)
                .iter()
                .map(|w| &w.id)
                .collect::<Vec<_>>()
        );
    }
}
