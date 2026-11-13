//! Bounded adaptive decisions; this module neither sleeps nor accesses devices.
use crate::{
    learner::{Context, Material, Mode, Profile},
    recording::Record,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
struct Window {
    n: u32,
    distance: u32,
    rescues: u32,
    blocks: u8,
    up_eligible: bool,
}
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
struct CopyState {
    pending: Option<Window>,
    up: u8,
    low: u8,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Controller {
    pub next_mode: Mode,
    pub recognition_good: u8,
    pub introduced_this_session: bool,
    recognition_run: u8,
    recognition_up: u8,
    recognition_low: u8,
    copying: BTreeMap<Context, CopyState>,
}
impl Default for Controller {
    fn default() -> Self {
        Self {
            next_mode: Mode::Recognition,
            recognition_good: 0,
            introduced_this_session: false,
            recognition_run: 0,
            recognition_up: 0,
            recognition_low: 0,
            copying: BTreeMap::new(),
        }
    }
}
impl Controller {
    pub fn can_introduce(&self) -> bool {
        self.recognition_good >= 2 && !self.introduced_this_session
    }
    pub fn introduced(&mut self) {
        self.introduced_this_session = true;
        self.recognition_good = 0;
    }
    pub fn reset_streaks(&mut self) {
        self.copying.clear();
        self.recognition_good = 0;
        self.recognition_up = 0;
        self.recognition_low = 0;
    }
    pub fn observe(&mut self, record: &Record, profile: &mut Profile, overridden: bool) -> String {
        if !record.is_practice() || record.compromised.is_some() || !record.completed {
            // Preserve completed-window streaks, but a partial sample cannot bridge an interruption.
            if record.policy == "cw-policy-v1.2"
                && record.is_practice()
                && record.context.mode == Mode::Copying
            {
                for state in self.copying.values_mut() {
                    state.pending = None;
                }
            }
            return "Interrupted/incomplete practice: hold difficulty and preserve evidence labels"
                .into();
        }
        if overridden {
            self.reset_streaks();
            return "Manual override: record conditions without adapting the saved automatic settings".into();
        }
        match record.context.mode {
            Mode::Recognition => self.recognition(record, profile),
            Mode::Copying => self.copy(record, profile),
        }
    }
    fn recognition(&mut self, record: &Record, profile: &mut Profile) -> String {
        self.recognition_run = self.recognition_run.saturating_add(1);
        let Some(accuracy) = record.metrics.attempt_accuracy else {
            if record.policy == "cw-policy-v1.2" {
                self.next_mode =
                    if self.recognition_run >= 2 && profile.introduced.chars().count() >= 2 {
                        Mode::Copying
                    } else {
                        Mode::Recognition
                    };
            }
            return "No independent recognition attempts: hold difficulty".into();
        };
        let n = record.metrics.target_count;
        self.next_mode = if accuracy < 0.8 && self.recognition_run < 2 {
            Mode::Recognition
        } else {
            Mode::Copying
        };
        if n < 8 {
            return "Collect more independent recognition evidence before a speed change".into();
        }
        self.recognition_good = if accuracy >= 0.9 {
            self.recognition_good.saturating_add(1)
        } else {
            0
        };
        let mut latencies: Vec<_> = record
            .observations
            .iter()
            .filter(|o| o.correct && !o.context.assisted)
            .filter_map(|o| o.latency_ns.filter(|v| *v >= 0))
            .collect();
        latencies.sort_unstable();
        let fast = latencies.len() >= 8
            && latencies[((0.9 * latencies.len() as f64).ceil() as usize) - 1] <= 800_000_000;
        self.recognition_up = if accuracy >= 0.95 && fast {
            self.recognition_up.saturating_add(1)
        } else {
            0
        };
        self.recognition_low = if accuracy < 0.7 {
            self.recognition_low.saturating_add(1)
        } else {
            0
        };
        if self.recognition_low >= 2 {
            let result = if profile.timeout_seconds < 8 {
                profile.timeout_seconds += 1;
                format!(
                    "Two recognition blocks below 70%: response window increased to {} s",
                    profile.timeout_seconds
                )
            } else {
                profile.recognition_c = profile.recognition_c.saturating_sub(1).max(12);
                format!(
                    "Recognition still below 70% with an 8 s window: character speed {} WPM",
                    profile.recognition_c
                )
            };
            self.reset_streaks();
            return result;
        }
        if self.can_introduce() && crate::planner::introduction(profile).is_some() {
            self.recognition_up = 0;
            return "Two accurate recognition blocks: introduce one symbol before increasing character speed".into();
        }
        if self.recognition_up >= 2 {
            profile.recognition_c = (profile.recognition_c + 1).min(35);
            self.reset_streaks();
            return format!(
                "Two accurate, fast recognition blocks: character speed {} WPM",
                profile.recognition_c
            );
        }
        format!(
            "Recognition {:.1}%: keep {} character WPM; reinforce coverage and review",
            100.0 * accuracy,
            profile.recognition_c
        )
    }
    fn copy(&mut self, record: &Record, profile: &mut Profile) -> String {
        self.recognition_run = 0;
        let accuracy = record.metrics.attempt_accuracy.unwrap_or(0.0);
        self.next_mode = Mode::Recognition;
        // Alternation already returns to recognition; copying difficulty remains independent.
        let context = record.context;
        for (key, state) in &mut self.copying {
            if *key != context {
                state.pending = None;
            }
        }
        if record.rescues >= 2 {
            profile.copying_e = profile.copying_e.saturating_sub(1).max(3);
            self.copying.clear();
            return format!(
                "Two catch-up gaps: next copying block at {} effective WPM",
                profile.copying_e
            );
        }
        let state = self.copying.entry(context).or_default();
        let up = record.backlog_covered()
            && accuracy >= 0.95
            && record.rescues == 0
            && record.metrics.ambiguous as f64 <= 0.2 * record.metrics.target_count as f64
            && record.metrics.end_backlog <= record.metrics.early_backlog + 1.0;
        let mut window = state.pending.take().unwrap_or(Window {
            up_eligible: true,
            ..Window::default()
        });
        window.n += record.metrics.target_count;
        window.distance += record.metrics.attempt_distance;
        window.rescues += record.rescues as u32;
        window.blocks += 1;
        window.up_eligible &= up;
        if window.n < 20 {
            if window.blocks < 3 {
                state.pending = Some(window);
            }
            return "Short copying sample: accumulate up to three same-context blocks before changing speed".into();
        }
        let aggregate = (1.0 - window.distance as f64 / window.n as f64).max(0.0);
        if aggregate < 0.8 || window.rescues >= 2 {
            state.up = 0;
            state.low = if aggregate < 0.7 {
                state.low.saturating_add(1)
            } else {
                0
            };
            if profile.copying_e > 3 {
                profile.copying_e -= 1;
                self.copying.clear();
                return format!(
                    "Copying {:.1}%: widen spacing to {} effective WPM",
                    100.0 * aggregate,
                    profile.copying_e
                );
            }
            if state.low >= 2 {
                profile.copying_c = profile.copying_c.saturating_sub(1).max(12);
                self.copying.clear();
                return format!(
                    "Copying remains below 70% at minimum effective speed: character WPM {}",
                    profile.copying_c
                );
            }
            return "Copying evidence is weak at minimum spacing speed: reinforce recognition"
                .into();
        }
        state.low = 0;
        if window.up_eligible {
            state.up = state.up.saturating_add(1);
            let count = profile
                .check_qualifications
                .entry((
                    context.character_wpm,
                    context.effective_wpm,
                    context.material,
                ))
                .or_default();
            *count = count.saturating_add(1).min(2);
            if context.material == Material::Groups {
                let count = profile
                    .group_qualifications
                    .entry((context.character_wpm, context.effective_wpm))
                    .or_default();
                *count = count.saturating_add(1).min(2);
            }
            if state.up >= 2 {
                // v1.1 prevents group speed advancement from starving the text gate.
                // v1 records retain their original transition and decision text on replay.
                if record.policy != "cw-policy-v1"
                    && context.material == Material::Groups
                    && profile
                        .check_qualifications
                        .get(&(context.character_wpm, context.effective_wpm, Material::Text))
                        .copied()
                        .unwrap_or(0)
                        < 2
                    && !crate::planner::eligible_text(profile, false).is_empty()
                {
                    return format!(
                        "Groups qualified at {}/{} WPM: consolidate eligible text before the next speed increase",
                        profile.copying_c, profile.copying_e
                    );
                }
                if profile.copying_e < profile.copying_c {
                    profile.copying_e += 1;
                } else {
                    profile.copying_c = (profile.copying_c + 1).min(35);
                }
                self.copying.clear();
                return format!(
                    "Two accurate, stable copying windows: next speed {}/{} WPM",
                    profile.copying_c, profile.copying_e
                );
            }
        } else {
            state.up = 0;
        }
        format!(
            "Copying {:.1}%: hold {}/{} WPM and gather another stable sample",
            100.0 * aggregate,
            profile.copying_c,
            profile.copying_e
        )
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Backlog {
    pub at_ns: u64,
    pub min: u32,
    pub max: u32,
}
#[derive(Debug)]
pub struct RescueTracker {
    baseline: f64,
    samples: VecDeque<Backlog>,
    pub count: u8,
    last_end: Option<u64>,
    started: Option<u64>,
    caught_up_since: Option<u64>,
}
impl RescueTracker {
    pub fn new(baseline: f64) -> Self {
        Self {
            baseline: baseline.max(0.0),
            samples: VecDeque::new(),
            count: 0,
            last_end: None,
            started: None,
            caught_up_since: None,
        }
    }
    pub fn sample(&mut self, value: Backlog) {
        if self.samples.back().is_some_and(|v| v.at_ns > value.at_ns) {
            return;
        }
        self.samples.push_back(value);
        while self
            .samples
            .front()
            .is_some_and(|v| value.at_ns.saturating_sub(v.at_ns) > 15_000_000_000)
        {
            self.samples.pop_front();
        }
    }
    pub fn should_request(&self, now: u64, last_input: u64, latest_errors: Option<u8>) -> bool {
        if self.count >= 2
            || self.started.is_some()
            || self
                .last_end
                .is_some_and(|t| now.saturating_sub(t) < 10_000_000_000)
        {
            return false;
        }
        let Some(current) = self.samples.back() else {
            return false;
        };
        if last_input > now || now < current.at_ns || now - current.at_ns > 100_000_000 {
            return false;
        }
        let threshold = 4u32.max((self.baseline + 3.0).ceil() as u32);
        let Some(old) = self
            .samples
            .iter()
            .rev()
            .find(|v| v.at_ns <= now.saturating_sub(3_000_000_000) && now >= 3_000_000_000)
        else {
            return false;
        };
        current.min >= threshold
            && current.min >= old.min.saturating_add(2)
            && (now.saturating_sub(last_input) >= 5_000_000_000
                || latest_errors.is_some_and(|v| v >= 3))
    }
    pub fn applied(&mut self, at: u64) {
        if self.started.is_none() {
            self.count = self.count.saturating_add(1);
            self.started = Some(at);
            self.caught_up_since = None;
        }
    }
    pub fn release_requested(&mut self, now: u64, backlog: u32) -> bool {
        let Some(start) = self.started else {
            return false;
        };
        if backlog as f64 <= self.baseline + 1.0 {
            self.caught_up_since.get_or_insert(now);
        } else {
            self.caught_up_since = None;
        }
        now.saturating_sub(start) >= 1_000_000_000
            && self
                .caught_up_since
                .is_some_and(|at| now.saturating_sub(at) >= 500_000_000)
    }
    pub fn finished(&mut self, at: u64) {
        self.started = None;
        self.last_end = Some(at);
        self.caught_up_since = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recording::{Kind, Metrics};
    fn copy(accuracy: f64, n: u32) -> Record {
        let mut r = Record::new(
            "test",
            Context::copying(20, 5, Material::Groups),
            Kind::Copying,
        );
        r.completed = true;
        r.transport_end_ns = 60_000_000_000;
        r.backlog = vec![(1_000_000_000, 0, 0), (59_000_000_000, 0, 0)];
        r.metrics = Metrics {
            target_count: n,
            attempt_distance: ((1.0 - accuracy) * n as f64).round() as u32,
            attempt_accuracy: Some(accuracy),
            ..Metrics::default()
        };
        r
    }
    #[test]
    fn copying_up_down_hold_and_low_sample_accumulation() {
        let mut c = Controller::default();
        let mut p = Profile::default();
        let good = copy(1.0, 20);
        c.observe(&good, &mut p, false);
        assert_eq!(p.copying_e, 5);
        c.observe(&good, &mut p, false);
        assert_eq!(p.copying_e, 6);
        let mut bad = copy(0.5, 20);
        bad.context.effective_wpm = 6;
        c.observe(&bad, &mut p, false);
        assert_eq!(p.copying_e, 5);
        let mut c = Controller::default();
        let short = copy(1.0, 10);
        for _ in 0..3 {
            c.observe(&short, &mut p, false);
        }
        assert_eq!(p.copying_e, 5);
        c.observe(&short, &mut p, false);
        assert_eq!(p.copying_e, 6);
    }
    #[test]
    fn repeated_rescue_and_overrides_cannot_raise_speed() {
        let mut p = Profile::default();
        let mut c = Controller::default();
        let mut r = copy(1.0, 5);
        r.rescues = 2;
        c.observe(&r, &mut p, false);
        assert_eq!(p.copying_e, 4);
        c.observe(&copy(1.0, 20), &mut p, true);
        assert_eq!(p.copying_e, 4);
        let mut stopped = copy(0.0, 20);
        stopped.completed = false;
        c.observe(&stopped, &mut p, false);
        assert_eq!(p.copying_e, 4);
    }
    #[test]
    fn stable_deliberate_lag_does_not_rescue_but_correlated_growth_does() {
        let mut tracker = RescueTracker::new(1.0);
        tracker.sample(Backlog {
            at_ns: 0,
            min: 8,
            max: 8,
        });
        tracker.sample(Backlog {
            at_ns: 5_000_000_000,
            min: 8,
            max: 8,
        });
        assert!(!tracker.should_request(5_000_000_000, 0, None));
        tracker.sample(Backlog {
            at_ns: 8_000_000_000,
            min: 11,
            max: 12,
        });
        assert!(tracker.should_request(8_000_000_000, 0, None));
        assert!(!tracker.should_request(8_200_000_000, 0, None));
        tracker.applied(8_000_000_000);
        assert!(!tracker.release_requested(8_500_000_000, 1));
        assert!(tracker.release_requested(9_000_000_000, 1));
        tracker.finished(9_000_000_000);
        tracker.sample(Backlog {
            at_ns: 10_000_000_000,
            min: 20,
            max: 20,
        });
        assert!(!tracker.should_request(10_000_000_000, 0, Some(3)));
    }
    #[test]
    fn alternating_classes_preserve_streaks_and_introduction_precedes_speed() {
        let mut profile = Profile::default();
        let mut controller = Controller::default();
        let group = copy(1.0, 20);
        let mut text = copy(1.0, 20);
        text.context.material = Material::Text;
        controller.observe(&group, &mut profile, false);
        controller.observe(&text, &mut profile, false);
        controller.observe(&group, &mut profile, false);
        assert_eq!(profile.copying_e, 6);
        let mut recognition = Record::new("test", Context::recognition(20), Kind::Recognition);
        recognition.completed = true;
        recognition.metrics.target_count = 10;
        recognition.metrics.attempt_accuracy = Some(1.0);
        recognition.observations = (0..10)
            .map(|_| crate::learner::Observation {
                symbol: 'K',
                context: recognition.context,
                correct: true,
                response: Some('K'),
                latency_ns: Some(100_000_000),
                utc_ms: 0,
                local_date: "day".into(),
            })
            .collect();
        controller.observe(&recognition, &mut profile, false);
        controller.observe(&recognition, &mut profile, false);
        assert!(controller.can_introduce());
        assert_eq!(profile.recognition_c, 20);
        controller.introduced();
        controller.observe(&recognition, &mut profile, false);
        controller.observe(&recognition, &mut profile, false);
        assert_eq!(profile.recognition_c, 21);
    }
    #[test]
    fn assisted_recognition_blocks_still_obey_the_automatic_mode_cap() {
        let mut profile = Profile::default();
        profile.introduce('K', 0);
        profile.introduce('M', 0);
        let mut record = Record::new("assisted", Context::recognition(20), Kind::Recognition);
        record.completed = true;
        let mut controller = Controller::default();
        controller.observe(&record, &mut profile, false);
        assert_eq!(controller.next_mode, Mode::Recognition);
        controller.observe(&record, &mut profile, false);
        assert_eq!(controller.next_mode, Mode::Copying);
        assert_eq!(profile.recognition_c, 20);
        let mut old = Controller::default();
        record.policy = "cw-policy-v1.1".into();
        old.observe(&record, &mut profile, false);
        old.observe(&record, &mut profile, false);
        assert_eq!(
            old.next_mode,
            Mode::Recognition,
            "preserve historical policy transitions"
        );
    }
    #[test]
    fn interruption_discards_partial_windows_but_preserves_completed_window_streaks() {
        let mut profile = Profile::default();
        let mut controller = Controller::default();
        let good = copy(1.0, 20);
        controller.observe(&good, &mut profile, false);
        let short = copy(1.0, 10);
        controller.observe(&short, &mut profile, false);
        assert!(controller.copying[&short.context].pending.is_some());
        let mut interrupted = short.clone();
        interrupted.completed = false;
        interrupted.compromised = Some("input fault".into());
        controller.observe(&interrupted, &mut profile, false);
        assert!(controller.copying[&short.context].pending.is_none());
        assert_eq!(controller.copying[&short.context].up, 1);
        assert_eq!(profile.copying_e, 5);
        controller.observe(&short, &mut profile, false);
        assert_eq!(profile.copying_e, 5);
        assert_eq!(
            controller.copying[&short.context]
                .pending
                .as_ref()
                .unwrap()
                .n,
            10
        );
    }
    #[test]
    fn minimum_speed_and_timeout_floors_are_enforced() {
        let mut profile = Profile {
            copying_c: 12,
            copying_e: 3,
            recognition_c: 12,
            timeout_seconds: 8,
            ..Profile::default()
        };
        let mut controller = Controller::default();
        let mut poor = copy(0.5, 20);
        poor.context = Context::copying(12, 3, Material::Groups);
        controller.observe(&poor, &mut profile, false);
        controller.observe(&poor, &mut profile, false);
        assert_eq!((profile.copying_c, profile.copying_e), (12, 3));
        poor.context = Context::recognition(12);
        poor.kind = Kind::Recognition;
        controller.observe(&poor, &mut profile, false);
        controller.observe(&poor, &mut profile, false);
        assert_eq!(profile.recognition_c, 12);
        assert_eq!(profile.timeout_seconds, 8);
    }
}
