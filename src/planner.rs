//! Seeded practice selection. Selected outcomes, not RNG assumptions, are persisted.
use crate::{
    learner::{Context, Learner, Material, Profile},
    timing::{SYMBOLS, Schedule, Timing, pattern},
};

pub const CORPUS_VERSION: &str = "dojo-original-v1";
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Weakness,
    Review,
    Coverage,
    Introduction,
}
#[derive(Debug, Clone)]
pub struct TrialPlan {
    pub symbol: char,
    pub category: Category,
    pub teach: bool,
}
#[derive(Debug)]
pub struct RecognitionPlan {
    pub trials: Vec<TrialPlan>,
    pub introduction: Option<char>,
    pub reason: String,
}
#[derive(Debug)]
pub struct CopyPlan {
    pub content: String,
    pub material: Material,
    pub corpus_id: Option<String>,
    pub reason: String,
}
#[derive(Debug, Clone, Copy)]
pub struct Random(u64);
impl Random {
    pub fn new(seed: u64) -> Self {
        Self(seed)
    }
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^ (z >> 31)
    }
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
    pub fn choose(&mut self, weights: &[f64]) -> Option<usize> {
        let sum: f64 = weights
            .iter()
            .copied()
            .filter(|v| v.is_finite() && *v > 0.0)
            .sum();
        if !sum.is_finite() || sum <= 0.0 {
            return None;
        }
        let mut roll = self.unit() * sum;
        for (i, &weight) in weights.iter().enumerate() {
            if weight.is_finite() && weight > 0.0 {
                if roll < weight {
                    return Some(i);
                }
                roll -= weight;
            }
        }
        weights.iter().rposition(|v| v.is_finite() && *v > 0.0)
    }
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = (self.unit() * (i + 1) as f64) as usize;
            items.swap(i, j);
        }
    }
}
pub fn weakness(learner: &Learner, symbol: char, context: Context, now: i64) -> f64 {
    let e = learner.estimate(symbol, context, now);
    0.1 + (1.0 - e.mean) + (e.upper - e.lower) + e.substitution_rate
}
pub fn introduction(profile: &Profile) -> Option<char> {
    let current: Vec<_> = profile.introduced.chars().collect();
    if current.is_empty() {
        return Some('K');
    }
    let mut best = None;
    let mut largest = 0;
    for c in SYMBOLS.chars().filter(|c| !profile.introduced.contains(*c)) {
        let separation = current
            .iter()
            .map(|a| pattern_distance(pattern(c).unwrap(), pattern(*a).unwrap()))
            .min()
            .unwrap();
        if best.is_none() || separation > largest {
            best = Some(c);
            largest = separation;
        }
    }
    best
}
fn pattern_distance(a: &str, b: &str) -> usize {
    let mut previous: Vec<_> = (0..=b.len()).collect();
    for (i, x) in a.bytes().enumerate() {
        let mut current = vec![i + 1];
        for (j, y) in b.bytes().enumerate() {
            current.push(
                (previous[j + 1] + 1)
                    .min(current[j] + 1)
                    .min(previous[j] + usize::from(x != y)),
            );
        }
        previous = current;
    }
    previous[b.len()]
}
pub fn recognition(
    profile: &Profile,
    learner: &Learner,
    now: i64,
    allow_new: bool,
    rng: &mut Random,
) -> RecognitionPlan {
    let new = if allow_new {
        introduction(profile)
    } else {
        None
    };
    let mut introduced: Vec<_> = profile.introduced.chars().collect();
    if let Some(c) = new {
        introduced.push(c);
    }
    if introduced.is_empty() {
        introduced.push('K');
    }
    let due: Vec<_> = introduced
        .iter()
        .copied()
        .filter(|c| profile.reviews.get(c).is_some_and(|r| r.due_ms <= now))
        .collect();
    let recent: Vec<_> = introduced
        .iter()
        .copied()
        .filter(|c| {
            Some(*c) == new
                || profile
                    .recent_introductions
                    .get(c)
                    .is_some_and(|s| profile.sessions.saturating_sub(*s) < 3)
        })
        .collect();
    let context = Context::recognition(profile.recognition_c);
    let weights: Vec<_> = introduced
        .iter()
        .map(|c| weakness(learner, *c, context, now))
        .collect();
    let mut quotas = [8u8, 5, 4, 3];
    if due.is_empty() {
        quotas[2] += quotas[1];
        quotas[1] = 0;
    }
    if recent.is_empty() {
        quotas[2] += quotas[3];
        quotas[3] = 0;
    }
    let mut out = Vec::new();
    let mut last = None;
    for _ in 0..20 {
        let bucket = rng.choose(&quotas.map(f64::from)).expect("remaining quota");
        quotas[bucket] -= 1;
        let category = [
            Category::Weakness,
            Category::Review,
            Category::Coverage,
            Category::Introduction,
        ][bucket];
        let force_new = category == Category::Introduction
            && new.is_some_and(|c| !out.iter().any(|p: &TrialPlan| p.symbol == c));
        let forced = new.into_iter().collect::<Vec<_>>();
        let candidates = if force_new {
            &forced
        } else {
            match category {
                Category::Review => &due,
                Category::Introduction => &recent,
                _ => &introduced,
            }
        };
        let mut eligible: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|c| introduced.len() < 2 || Some(*c) != last)
            .collect();
        let mut selected_category = category;
        if eligible.is_empty() {
            eligible = introduced
                .iter()
                .copied()
                .filter(|c| Some(*c) != last || introduced.len() < 2)
                .collect();
            selected_category = Category::Coverage;
        }
        let values: Vec<_> = eligible
            .iter()
            .map(|c| match selected_category {
                Category::Weakness => weights[introduced.iter().position(|v| v == c).unwrap()],
                Category::Review => {
                    let r = &profile.reviews[c];
                    1.0 + ((now - r.due_ms).max(0) as f64 / r.interval_ms as f64).min(3.0)
                }
                _ => 1.0,
            })
            .collect();
        let symbol = eligible[rng.choose(&values).unwrap()];
        let teach = Some(symbol) == new && !out.iter().any(|p: &TrialPlan| p.symbol == symbol);
        out.push(TrialPlan {
            symbol,
            category: selected_category,
            teach,
        });
        last = Some(symbol);
    }
    RecognitionPlan {
        trials: out,
        introduction: new,
        reason: if let Some(c) = new {
            format!("Introduce {c}; retain review and coverage")
        } else if !due.is_empty() {
            "Review due symbols while practicing weak and unobserved material".into()
        } else {
            "Build independent recognition evidence and reinforce weaknesses".into()
        },
    }
}
#[derive(Clone, Copy)]
pub struct Passage {
    pub id: &'static str,
    pub check: bool,
    pub text: &'static str,
}
pub fn corpus() -> Vec<Passage> {
    include_str!("../assets/corpus.tsv")
        .lines()
        .map(|line| {
            let mut fields = line.splitn(3, '\t');
            Passage {
                id: fields.next().unwrap(),
                check: fields.next().unwrap() == "check",
                text: fields.next().unwrap(),
            }
        })
        .collect()
}
pub fn eligible_text(profile: &Profile, check: bool) -> Vec<Passage> {
    corpus()
        .into_iter()
        .filter(|p| {
            p.check == check
                && (!check || !profile.seen_text.contains(p.id))
                && p.text
                    .chars()
                    .all(|c| c == ' ' || profile.introduced.contains(c))
        })
        .collect()
}
/// Compile successive complete-character prefixes, always including a final word gap.
pub fn fit_text(text: &str, c: u8, e: u8, rate: u32, seconds: u32) -> Result<String, &'static str> {
    if seconds == 0 || seconds > 180 {
        return Err("invalid block duration");
    }
    let timing = Timing::new(c as f64, e as f64).map_err(|_| "invalid speeds")?;
    let mut candidate = String::new();
    let mut accepted = String::new();
    for character in text.chars() {
        if candidate.chars().count() >= 4096 {
            break;
        }
        candidate.push(character);
        if character == ' ' {
            continue;
        }
        match Schedule::compile(&candidate, timing, rate) {
            Ok(schedule) if schedule.frames <= rate as u64 * seconds as u64 => {
                accepted = candidate.clone()
            }
            _ => break,
        }
    }
    if accepted.is_empty() {
        Err("no complete character fits the selected block")
    } else {
        Ok(accepted)
    }
}
pub fn copying(
    profile: &Profile,
    learner: &Learner,
    now: i64,
    material: Material,
    seconds: u32,
    check: bool,
    rng: &mut Random,
) -> Result<CopyPlan, &'static str> {
    if profile.introduced.chars().count() < 2 {
        return Err("teach at least two characters before copying");
    }
    let c = profile.copying_c;
    let e = profile.copying_e;
    if material == Material::Text {
        let eligible = eligible_text(profile, check);
        if !eligible.is_empty() {
            let p = eligible[rng.choose(&vec![1.0; eligible.len()]).unwrap()];
            let content = fit_text(p.text, c, e, 48000, seconds)?;
            return Ok(CopyPlan {
                content,
                material: Material::Text,
                corpus_id: Some(p.id.into()),
                reason: if check {
                    "Unseen fixed-pace plain-text check".into()
                } else {
                    "Transfer recognition into ordinary unfamiliar text".into()
                },
            });
        }
    }
    let symbols: Vec<_> = profile.introduced.chars().collect();
    let context = Context::copying(c, e, Material::Groups);
    let weak: Vec<_> = symbols
        .iter()
        .map(|v| weakness(learner, *v, context, now))
        .collect();
    let total: f64 = weak.iter().sum();
    let weights: Vec<_> = weak
        .iter()
        .map(|w| {
            if check {
                1.0
            } else {
                0.7 / symbols.len() as f64 + 0.3 * w / total
            }
        })
        .collect();
    for _ in 0..32 {
        let mut source = String::new();
        for index in 0..1600 {
            if index > 0 && index % 5 == 0 {
                source.push(' ');
            }
            source.push(symbols[rng.choose(&weights).unwrap()]);
        }
        let content = fit_text(&source, c, e, 48000, seconds)?;
        if !check || !profile.has_exercise(&content) {
            return Ok(CopyPlan {
                content,
                material: Material::Groups,
                corpus_id: None,
                reason: if check {
                    "Unfamiliar uniform-group check; steady pace, no rescue".into()
                } else {
                    "Practice continuous copying with broad coverage and targeted reinforcement"
                        .into()
                },
            });
        }
    }
    Err("unable to select an unused assessment sequence")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn corpus_has_unique_ids_disjoint_pools_and_only_supported_symbols() {
        let items = corpus();
        let ids: std::collections::BTreeSet<_> = items.iter().map(|p| p.id).collect();
        assert_eq!(items.len(), ids.len());
        assert_eq!(items.iter().filter(|p| p.check).count(), 5);
        for p in items {
            assert!(p.text.chars().all(|c| c == ' ' || pattern(c).is_some()));
            if p.check {
                assert!(p.text.len() > 900);
            }
        }
    }
    #[test]
    fn quotas_and_no_adjacent_repeat_hold_with_all_categories_populated() {
        let mut p = Profile::default();
        for c in "ABCD".chars() {
            p.introduce(c, 0);
        }
        let plan = recognition(
            &p,
            &Learner::default(),
            crate::learner::DAY_MS,
            false,
            &mut Random::new(1),
        );
        assert_eq!(plan.trials.len(), 20);
        assert!(plan.trials.windows(2).all(|v| v[0].symbol != v[1].symbol));
        for (category, n) in [
            (Category::Weakness, 8),
            (Category::Review, 5),
            (Category::Coverage, 4),
            (Category::Introduction, 3),
        ] {
            assert_eq!(
                plan.trials
                    .iter()
                    .filter(|v| v.category == category)
                    .count(),
                n
            );
        }
    }
    #[test]
    fn empty_categories_and_unknown_contexts_are_defined() {
        let mut p = Profile::default();
        p.introduce('A', 0);
        p.sessions = 5;
        let plan = recognition(&p, &Learner::default(), 0, false, &mut Random::new(3));
        assert_eq!(plan.trials.len(), 20);
        assert!(plan.trials.iter().all(|v| v.symbol == 'A'));
        let plan = recognition(&p, &Learner::default(), 0, true, &mut Random::new(2));
        assert!(plan.introduction.is_some());
        assert_eq!(plan.trials.iter().filter(|v| v.teach).count(), 1);
    }
    #[test]
    fn seeded_selection_and_complete_character_limits_are_reproducible() {
        let mut p = Profile::default();
        p.introduce('K', 0);
        p.introduce('M', 0);
        let a = copying(
            &p,
            &Learner::default(),
            0,
            Material::Groups,
            60,
            false,
            &mut Random::new(9),
        )
        .unwrap();
        let b = copying(
            &p,
            &Learner::default(),
            0,
            Material::Groups,
            60,
            false,
            &mut Random::new(9),
        )
        .unwrap();
        assert_eq!(a.content, b.content);
        let schedule =
            Schedule::compile(&a.content, Timing::new(20.0, 5.0).unwrap(), 48000).unwrap();
        assert!(schedule.frames <= 60 * 48000);
        assert!(!a.content.ends_with(' '));
        assert!(a.content.chars().all(|c| "KM ".contains(c)));
    }
    #[test]
    fn check_text_never_uses_seen_passages_and_can_fall_back_to_groups() {
        let mut p = Profile::default();
        for c in SYMBOLS.chars() {
            p.introduce(c, 0);
        }
        let first = copying(
            &p,
            &Learner::default(),
            0,
            Material::Text,
            180,
            true,
            &mut Random::new(1),
        )
        .unwrap();
        assert_eq!(first.material, Material::Text);
        for psg in corpus().into_iter().filter(|v| v.check) {
            p.seen_text.insert(psg.id.into());
        }
        let fallback = copying(
            &p,
            &Learner::default(),
            0,
            Material::Text,
            180,
            true,
            &mut Random::new(1),
        )
        .unwrap();
        assert_eq!(fallback.material, Material::Groups);
    }
}
