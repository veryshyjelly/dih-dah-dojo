//! Context-specific evidence estimates and explicit review scheduling (cw-policy-v1).
use crate::timing::pattern;
use serde::{Deserialize, Serialize};
use statrs::distribution::{Beta, ContinuousCDF};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub const POLICY: &str = "cw-policy-v1";
pub const DAY_MS: i64 = 86_400_000;
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Mode {
    Recognition,
    Copying,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Material {
    Isolated,
    Groups,
    Text,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Context {
    pub mode: Mode,
    pub character_wpm: u8,
    pub effective_wpm: u8,
    pub material: Material,
    pub assisted: bool,
}
impl Context {
    pub fn recognition(c: u8) -> Self {
        Self {
            mode: Mode::Recognition,
            character_wpm: c,
            effective_wpm: 0,
            material: Material::Isolated,
            assisted: false,
        }
    }
    pub fn copying(c: u8, e: u8, material: Material) -> Self {
        Self {
            mode: Mode::Copying,
            character_wpm: c,
            effective_wpm: e,
            material,
            assisted: false,
        }
    }
    pub fn valid(&self) -> bool {
        (12..=35).contains(&self.character_wpm)
            && match self.mode {
                Mode::Recognition => self.effective_wpm == 0 && self.material == Material::Isolated,
                Mode::Copying => {
                    (3..=self.character_wpm).contains(&self.effective_wpm)
                        && self.material != Material::Isolated
                }
            }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Observation {
    pub symbol: char,
    pub context: Context,
    pub correct: bool,
    pub response: Option<char>,
    /// Signed latency relative to sound end, not a measure of cognition alone.
    pub latency_ns: Option<i64>,
    pub utc_ms: i64,
    pub local_date: String,
}
#[derive(Debug, Clone)]
pub struct Estimate {
    pub mean: f64,
    pub lower: f64,
    pub upper: f64,
    pub effective_evidence: f64,
    pub independent_dates: usize,
    pub reliable: bool,
    pub latency_median_ns: Option<i64>,
    pub latency_p90_ns: Option<i64>,
    pub latency_count: usize,
    pub substitution_rate: f64,
    /// (response, conditional posterior mean, unweighted directed pair count)
    pub confusions: Vec<(char, f64, usize)>,
}
#[derive(Default)]
pub struct Learner {
    states: BTreeMap<(char, Context), VecDeque<Observation>>,
}
impl Learner {
    pub fn observe(&mut self, value: Observation) -> Result<(), &'static str> {
        if pattern(value.symbol).is_none()
            || !value.symbol.is_ascii()
            || value.symbol.is_ascii_lowercase()
            || !value.context.valid()
            || value.local_date.is_empty()
            || value
                .response
                .is_some_and(|c| pattern(c).is_none() || c.is_ascii_lowercase())
        {
            return Err("invalid learner observation");
        }
        if value.correct && value.response != Some(value.symbol) {
            return Err("correct observation must identify the matching response");
        }
        if !value.correct && value.response == Some(value.symbol) {
            return Err("failure cannot be a matching response");
        }
        let state = self
            .states
            .entry((value.symbol, value.context))
            .or_default();
        state.push_back(value);
        if state.len() > 100 {
            state.pop_front();
        }
        Ok(())
    }
    pub fn estimate(&self, symbol: char, context: Context, now_ms: i64) -> Estimate {
        let mut alpha = 1.0;
        let mut beta = 1.0;
        let mut dates = BTreeSet::new();
        let mut latencies = Vec::new();
        let mut substitutions = BTreeMap::<char, (f64, usize)>::new();
        if let Some(items) = self.states.get(&(symbol, context)) {
            for item in items {
                let days = now_ms.saturating_sub(item.utc_ms).max(0) as f64 / DAY_MS as f64;
                let weight = 2.0f64.powf(-days / 30.0);
                if item.correct {
                    alpha += weight;
                } else {
                    beta += weight;
                }
                if !context.assisted {
                    dates.insert(item.local_date.as_str());
                }
                if !context.assisted
                    && item.correct
                    && let Some(delay) = item.latency_ns.filter(|v| *v >= 0)
                {
                    latencies.push(delay);
                }
                if !item.correct
                    && let Some(response) = item.response
                {
                    let pair = substitutions.entry(response).or_default();
                    pair.0 += weight;
                    pair.1 += 1;
                }
            }
        }
        let evidence = alpha + beta - 2.0;
        let total_substitutions: f64 = substitutions.values().map(|v| v.0).sum();
        let mut confusions: Vec<_> = substitutions
            .into_iter()
            .map(|(c, (weight, count))| (c, (1.0 + weight) / (41.0 + total_substitutions), count))
            .collect();
        confusions.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        if latencies.len() > 30 {
            latencies.drain(..latencies.len() - 30);
        }
        latencies.sort_unstable();
        let (lower, upper) = if evidence == 0.0 {
            (0.1, 0.9)
        } else {
            let distribution = Beta::new(alpha, beta).expect("positive finite evidence");
            (distribution.inverse_cdf(0.1), distribution.inverse_cdf(0.9))
        };
        Estimate {
            mean: alpha / (alpha + beta),
            lower,
            upper,
            effective_evidence: evidence,
            independent_dates: dates.len(),
            reliable: !context.assisted && lower >= 0.9 && evidence >= 30.0 && dates.len() >= 2,
            latency_median_ns: quantile(&latencies, 0.5),
            latency_p90_ns: quantile(&latencies, 0.9),
            latency_count: latencies.len(),
            substitution_rate: if evidence > 0.0 {
                total_substitutions / evidence
            } else {
                0.0
            },
            confusions,
        }
    }
    pub fn contexts(&self) -> impl Iterator<Item = &(char, Context)> {
        self.states.keys()
    }
}
fn quantile(values: &[i64], q: f64) -> Option<i64> {
    (!values.is_empty())
        .then(|| values[((q * values.len() as f64).ceil() as usize).saturating_sub(1)])
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Review {
    pub interval_ms: i64,
    pub due_ms: i64,
}
impl Review {
    pub fn new(now: i64) -> Self {
        Self {
            interval_ms: DAY_MS,
            due_ms: now.saturating_add(DAY_MS),
        }
    }
    pub fn update(
        &mut self,
        now: i64,
        correct: bool,
        latency_ns: Option<i64>,
        independent: bool,
    ) -> bool {
        if !independent || now < self.due_ms {
            return false;
        }
        let fluent = correct && latency_ns.is_some_and(|v| (0..=800_000_000).contains(&v));
        self.interval_ms = if fluent {
            ((self.interval_ms as f64 * 1.7).round() as i64).min(90 * DAY_MS)
        } else {
            (self.interval_ms / 2).max(600_000)
        };
        self.due_ms = now.saturating_add(self.interval_ms);
        true
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub introduced: String,
    pub entry_complete: bool,
    pub recognition_c: u8,
    pub copying_c: u8,
    pub copying_e: u8,
    pub timeout_seconds: u8,
    pub sessions: u32,
    pub reviews: BTreeMap<char, Review>,
    pub offered_dates: BTreeSet<String>,
    pub used_checks: BTreeSet<String>,
    pub seen_text: BTreeSet<String>,
    pub recent_introductions: BTreeMap<char, u32>,
    pub group_qualifications: BTreeMap<(u8, u8), u8>,
    pub check_qualifications: BTreeMap<(u8, u8, Material), u8>,
}
impl Default for Profile {
    fn default() -> Self {
        Self {
            introduced: String::new(),
            entry_complete: false,
            recognition_c: 20,
            copying_c: 20,
            copying_e: 5,
            timeout_seconds: 4,
            sessions: 0,
            reviews: BTreeMap::new(),
            offered_dates: BTreeSet::new(),
            used_checks: BTreeSet::new(),
            seen_text: BTreeSet::new(),
            recent_introductions: BTreeMap::new(),
            group_qualifications: BTreeMap::new(),
            check_qualifications: BTreeMap::new(),
        }
    }
}
impl Profile {
    pub fn introduce(&mut self, symbol: char, now: i64) -> bool {
        if pattern(symbol).is_none()
            || symbol.is_ascii_lowercase()
            || self.introduced.contains(symbol)
        {
            return false;
        }
        self.introduced.push(symbol);
        self.reviews.insert(symbol, Review::new(now));
        self.recent_introductions.insert(symbol, self.sessions);
        true
    }
    pub fn validate(&self) -> Result<(), &'static str> {
        if !Context::recognition(self.recognition_c).valid()
            || !Context::copying(self.copying_c, self.copying_e, Material::Groups).valid()
            || !(4..=8).contains(&self.timeout_seconds)
        {
            return Err("invalid saved speed/timeout");
        }
        let mut seen = BTreeSet::new();
        for c in self.introduced.chars() {
            if pattern(c).is_none() || c.is_ascii_lowercase() || !seen.insert(c) {
                return Err("invalid introduced repertoire");
            }
        }
        if self.reviews.iter().any(|(c, r)| {
            !seen.contains(c) || r.interval_ms < 600_000 || r.interval_ms > 90 * DAY_MS
        }) {
            return Err("invalid review state");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn observation(correct: bool, day: i64) -> Observation {
        Observation {
            symbol: 'A',
            context: Context::recognition(20),
            correct,
            response: Some(if correct { 'A' } else { 'B' }),
            latency_ns: Some(500_000_000),
            utc_ms: day * DAY_MS,
            local_date: format!("day-{day}"),
        }
    }
    #[test]
    fn reference_prior_half_life_and_quantile_are_exact() {
        let mut model = Learner::default();
        let context = Context::recognition(20);
        let prior = model.estimate('A', context, 0);
        assert_eq!((prior.mean, prior.lower, prior.upper), (0.5, 0.1, 0.9));
        model.observe(observation(true, 0)).unwrap();
        let aged = model.estimate('A', context, 30 * DAY_MS);
        assert!((aged.mean - 0.6).abs() < 1e-12);
        assert!((aged.effective_evidence - 0.5).abs() < 1e-12);
        let mut model = Learner::default();
        for _ in 0..30 {
            model.observe(observation(true, 0)).unwrap();
        }
        let estimate = model.estimate('A', context, 0);
        assert!((estimate.lower - 0.9284145445194744).abs() < 1e-8);
        assert!(!estimate.reliable);
        model.observe(observation(true, 1)).unwrap();
        assert!(model.estimate('A', context, DAY_MS).reliable);
    }
    #[test]
    fn context_and_assistance_do_not_leak_and_history_is_bounded() {
        let mut model = Learner::default();
        for _ in 0..200 {
            model.observe(observation(true, 0)).unwrap();
        }
        assert!(
            (model
                .estimate('A', Context::recognition(20), 0)
                .effective_evidence
                - 100.0)
                .abs()
                < 1e-12
        );
        assert_eq!(model.estimate('A', Context::recognition(21), 0).mean, 0.5);
        let mut value = observation(true, 0);
        value.context.assisted = true;
        model.observe(value.clone()).unwrap();
        assert!(!model.estimate('A', value.context, 0).reliable);
        assert_eq!(
            model
                .estimate('A', Context::copying(20, 5, Material::Groups), 0)
                .mean,
            0.5
        );
    }
    #[test]
    fn latency_and_confusion_keep_their_own_evidence() {
        let mut model = Learner::default();
        for i in 1..=8 {
            let mut o = observation(true, 0);
            o.latency_ns = Some(i * 100_000_000);
            model.observe(o).unwrap();
        }
        let mut early = observation(true, 0);
        early.latency_ns = Some(-10);
        model.observe(early).unwrap();
        for _ in 0..3 {
            model.observe(observation(false, 0)).unwrap();
        }
        let e = model.estimate('A', Context::recognition(20), 0);
        assert_eq!(e.latency_count, 8);
        assert_eq!(e.latency_median_ns, Some(400_000_000));
        assert_eq!(e.latency_p90_ns, Some(800_000_000));
        assert_eq!(e.confusions[0].0, 'B');
        assert_eq!(e.confusions[0].2, 3);
        assert!((e.confusions[0].1 - 4.0 / 44.0).abs() < 1e-12);
    }
    #[test]
    fn review_schedule_distinguishes_due_slow_assisted_and_early() {
        let mut r = Review::new(0);
        assert!(!r.update(0, true, Some(10), true));
        assert_eq!(r.due_ms, DAY_MS);
        assert!(!r.update(DAY_MS, true, Some(10), false));
        assert!(r.update(DAY_MS, true, Some(500_000_000), true));
        assert_eq!(r.interval_ms, 146_880_000);
        assert!(r.update(r.due_ms, true, Some(900_000_000), true));
        assert_eq!(r.interval_ms, 73_440_000);
        r.interval_ms = 600_000;
        r.update(r.due_ms, false, None, true);
        assert_eq!(r.interval_ms, 600_000);
        r.interval_ms = 90 * DAY_MS;
        r.update(r.due_ms, true, Some(0), true);
        assert_eq!(r.interval_ms, 90 * DAY_MS);
    }
    #[test]
    fn binary_profile_round_trip_and_validation() {
        let mut p = Profile::default();
        p.introduce('A', 0);
        p.introduce('B', 0);
        assert!(p.validate().is_ok());
        assert!(!p.introduce('a', 0));
        let bytes = postcard::to_allocvec(&p).unwrap();
        let decoded: Profile = postcard::from_bytes(&bytes).unwrap();
        assert_eq!(decoded.introduced, "AB");
        assert_eq!(decoded.copying_e, 5);
        p.copying_e = 40;
        assert!(p.validate().is_err());
    }
    #[test]
    fn beta_quantiles_meet_documented_probability_tolerance() {
        for a in [1.0, 1.5, 2.0, 10.0, 31.0, 101.0] {
            for b in [1.0, 1.5, 2.0, 10.0, 31.0, 101.0] {
                let distribution = Beta::new(a, b).unwrap();
                for probability in [0.1, 0.9] {
                    let value = distribution.inverse_cdf(probability);
                    assert!(
                        (distribution.cdf(value) - probability).abs() <= 1e-8,
                        "a={a} b={b} p={probability}"
                    );
                }
            }
        }
    }
}
