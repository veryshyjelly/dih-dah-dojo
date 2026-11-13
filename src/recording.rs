//! Durable record schema v2. Change schema/version before changing binary field layouts.
use crate::{
    learner::{Context, Material, Mode, Observation, POLICY},
    scoring::{Outcome, score_copy},
    transcript::{InputRecord, Symbol, Transcript},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Kind {
    Entry,
    Recognition,
    Copying,
    Check,
    SessionEnd,
    CheckOffered,
    Teaching,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecognitionTrial {
    pub symbol: char,
    pub onset_ns: u64,
    pub end_ns: u64,
    pub response: Option<Symbol>,
    pub assisted: bool,
    pub compromised: bool,
    pub explicit_unknown: bool,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Metrics {
    pub target_count: u32,
    pub attempt_distance: u32,
    pub final_distance: u32,
    pub attempt_accuracy: Option<f64>,
    pub final_accuracy: Option<f64>,
    pub ambiguous: u32,
    pub early_backlog: f64,
    pub end_backlog: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delivery {
    pub kind: crate::transport::EventKind,
    pub engine: u64,
    pub character: u32,
    pub output_frame: u64,
    pub estimated_ns: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Record {
    pub schema: u16,
    pub policy: String,
    pub session_id: String,
    pub utc_ms: i64,
    pub wall_anchor_ns: u64,
    pub local_date: String,
    pub utc_offset_seconds: i32,
    pub kind: Kind,
    pub context: Context,
    pub content: String,
    pub repertoire: String,
    pub corpus_id: Option<String>,
    pub corpus_version: Option<String>,
    pub inputs: Vec<InputRecord>,
    pub delivery: Vec<Delivery>,
    pub clock_residual_p99_ns: u64,
    pub clock_calibrated: bool,
    pub onsets: Vec<Symbol>,
    pub ends_ns: Vec<u64>,
    pub trials: Vec<RecognitionTrial>,
    pub transport_start_ns: u64,
    pub transport_end_ns: u64,
    pub backlog: Vec<(u64, u32, u32)>,
    pub assessment_elapsed_ns: u64,
    pub scheduled_ns: u64,
    pub rescue_ns: u64,
    pub rescues: u8,
    pub completed: bool,
    pub compromised: Option<String>,
    pub metrics: Metrics,
    pub observations: Vec<Observation>,
    pub selection_reason: String,
    pub manual_override: bool,
    pub decision: String,
    pub policy_audit: Option<Box<PolicyAudit>>,
}
/// Boundary snapshots make review updates, automatic state, and decision text replayable.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PolicyAudit {
    pub before_profile: crate::learner::Profile,
    pub after_profile: crate::learner::Profile,
    pub before_controller: crate::control::Controller,
    pub after_controller: crate::control::Controller,
}
impl Record {
    pub fn new(session_id: &str, context: Context, kind: Kind) -> Self {
        let now = chrono::Local::now();
        Self {
            schema: 2,
            policy: POLICY.into(),
            session_id: session_id.into(),
            utc_ms: now.timestamp_millis(),
            wall_anchor_ns: 0,
            local_date: now.date_naive().to_string(),
            utc_offset_seconds: now.offset().local_minus_utc(),
            kind,
            context,
            content: String::new(),
            repertoire: String::new(),
            corpus_id: None,
            corpus_version: None,
            inputs: Vec::new(),
            delivery: Vec::new(),
            clock_residual_p99_ns: 0,
            clock_calibrated: false,
            onsets: Vec::new(),
            ends_ns: Vec::new(),
            trials: Vec::new(),
            transport_start_ns: 0,
            transport_end_ns: 0,
            backlog: Vec::new(),
            assessment_elapsed_ns: 0,
            scheduled_ns: 0,
            rescue_ns: 0,
            rescues: 0,
            completed: false,
            compromised: None,
            metrics: Metrics::default(),
            observations: Vec::new(),
            selection_reason: String::new(),
            manual_override: false,
            decision: String::new(),
            policy_audit: None,
        }
    }
    pub fn apply_policy(
        &mut self,
        controller: &mut crate::control::Controller,
        profile: &mut crate::learner::Profile,
    ) {
        let before_profile = profile.clone();
        let before_controller = controller.clone();
        for observation in &self.observations {
            if observation.context.mode == Mode::Recognition
                && let Some(review) = profile.reviews.get_mut(&observation.symbol)
            {
                review.update(
                    observation.utc_ms,
                    observation.correct,
                    observation.latency_ns,
                    !observation.context.assisted,
                );
            }
        }
        if self.is_practice() {
            self.decision = controller.observe(self, profile, self.manual_override);
        }
        self.policy_audit = Some(Box::new(PolicyAudit {
            before_profile,
            before_controller,
            after_profile: profile.clone(),
            after_controller: controller.clone(),
        }));
    }
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.schema != 2 || self.policy != POLICY || !self.context.valid() {
            return Err("unsupported/invalid practice record");
        }
        if self
            .metrics
            .attempt_accuracy
            .is_some_and(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
            || self
                .metrics
                .final_accuracy
                .is_some_and(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
        {
            return Err("invalid saved accuracy");
        }
        if self.onsets.len() != self.ends_ns.len() {
            return Err("onset/end record mismatch");
        }
        if self
            .onsets
            .iter()
            .zip(&self.ends_ns)
            .any(|(start, end)| *end < start.at_ns)
            || self.trials.iter().any(|trial| {
                trial.end_ns < trial.onset_ns
                    || trial
                        .response
                        .is_some_and(|response| response.at_ns < trial.onset_ns)
            })
        {
            return Err("invalid or anticipatory delivery/response timestamps");
        }
        Ok(())
    }
    pub fn derive(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        self.validate()?;
        self.observations.clear();
        self.metrics = Metrics::default();
        if self.context.mode == Mode::Recognition {
            let mut independent = 0u32;
            let mut correct = 0u32;
            for trial in &self.trials {
                if trial.compromised {
                    continue;
                }
                let response = trial.response.map(|v| v.character);
                let success = response == Some(trial.symbol);
                let latency = trial
                    .response
                    .map(|v| signed_difference(v.at_ns, trial.end_ns));
                let mut context = self.context;
                context.assisted = trial.assisted;
                let (utc_ms, local_date) = self.observation_time(trial.end_ns);
                self.observations.push(Observation {
                    symbol: trial.symbol,
                    context,
                    correct: success,
                    response,
                    latency_ns: latency,
                    utc_ms,
                    local_date,
                });
                if !trial.assisted {
                    independent += 1;
                    correct += u32::from(success);
                }
            }
            self.metrics.target_count = independent;
            self.metrics.attempt_distance = independent - correct;
            self.metrics.final_distance = independent - correct;
            self.metrics.attempt_accuracy =
                (independent > 0).then(|| correct as f64 / independent as f64);
            self.metrics.final_accuracy = self.metrics.attempt_accuracy;
        } else {
            if self.compromised.is_some() {
                return Ok(());
            }
            let mut transcript = Transcript::default();
            for event in &self.inputs {
                if transcript.record(event.edit, event.at_ns)? != event.accepted {
                    return Err("stored input acceptance differs from replay".into());
                }
            }
            let attempts = score_copy(&self.onsets, transcript.attempts())?;
            let final_score = score_copy(&self.onsets, transcript.final_text())?;
            self.metrics.target_count = attempts.primary.target_count as u32;
            self.metrics.attempt_distance = attempts.primary.distance;
            self.metrics.final_distance = final_score.primary.distance;
            self.metrics.attempt_accuracy = attempts.primary.accuracy;
            self.metrics.final_accuracy = final_score.primary.accuracy;
            let mut context = self.context;
            context.assisted = self.rescues > 0;
            for item in attempts.primary.outcomes {
                let (correct, response, latency) = match item.outcome {
                    Outcome::Ambiguous => {
                        self.metrics.ambiguous += 1;
                        continue;
                    }
                    Outcome::Omitted => (false, None, None),
                    Outcome::Matched { response_index }
                    | Outcome::Substituted { response_index } => {
                        let value = transcript.attempts()[response_index];
                        (
                            value.character == item.target.character,
                            Some(value.character),
                            Some(signed_difference(
                                value.at_ns,
                                self.ends_ns[item.target_index],
                            )),
                        )
                    }
                };
                let (utc_ms, local_date) = self.observation_time(self.ends_ns[item.target_index]);
                self.observations.push(Observation {
                    symbol: item.target.character,
                    context,
                    correct,
                    response,
                    latency_ns: latency,
                    utc_ms,
                    local_date,
                });
            }
        }
        let early: Vec<_> = self
            .backlog
            .iter()
            .filter(|(at, _, _)| {
                *at >= self.transport_start_ns
                    && *at <= self.transport_start_ns.saturating_add(10_000_000_000)
            })
            .map(|(_, min, _)| *min)
            .collect();
        let late: Vec<_> = self
            .backlog
            .iter()
            .filter(|(at, _, _)| {
                *at >= self.transport_end_ns.saturating_sub(10_000_000_000)
                    && *at <= self.transport_end_ns
            })
            .map(|(_, min, _)| *min)
            .collect();
        fn median(mut values: Vec<u32>) -> f64 {
            if values.is_empty() {
                return 0.0;
            }
            values.sort_unstable();
            values[(values.len() - 1) / 2] as f64
        }
        self.metrics.early_backlog = median(early);
        self.metrics.end_backlog = median(late);
        Ok(())
    }
    fn observation_time(&self, at_ns: u64) -> (i64, String) {
        let delta = (at_ns as i128 - self.wall_anchor_ns as i128) / 1_000_000;
        let utc = (self.utc_ms as i128 + delta).clamp(i64::MIN as i128, i64::MAX as i128) as i64;
        let local = utc.saturating_add(self.utc_offset_seconds as i64 * 1000);
        let date = chrono::DateTime::from_timestamp_millis(local)
            .map_or_else(|| self.local_date.clone(), |v| v.date_naive().to_string());
        (utc, date)
    }
    pub fn backlog_covered(&self) -> bool {
        self.backlog.iter().any(|(at, _, _)| {
            *at >= self.transport_start_ns
                && *at <= self.transport_start_ns.saturating_add(10_000_000_000)
        }) && self.backlog.iter().any(|(at, _, _)| {
            *at >= self.transport_end_ns.saturating_sub(10_000_000_000)
                && *at <= self.transport_end_ns
        })
    }
    pub fn qualifying_check(&self) -> bool {
        self.kind == Kind::Check
            && self.assessment_elapsed_ns >= 180_000_000_000
            && !self.context.assisted
            && self.completed
            && self.compromised.is_none()
            && self.rescues == 0
            && self.metrics.target_count > 0
            && self.metrics.attempt_accuracy.is_some_and(|a| a >= 0.95)
    }
    pub fn conditions(&self) -> (Context, &str, &str, Option<&str>) {
        (
            self.context,
            self.repertoire.as_str(),
            self.policy.as_str(),
            if self.context.material == Material::Text {
                self.corpus_version.as_deref()
            } else {
                None
            },
        )
    }
    pub fn comparable(&self, other: &Self) -> bool {
        self.conditions() == other.conditions()
    }
    pub fn is_practice(&self) -> bool {
        matches!(self.kind, Kind::Recognition | Kind::Copying)
    }
}
pub fn signed_difference(a: u64, b: u64) -> i64 {
    ((a as i128 - b as i128).clamp(i64::MIN as i128, i64::MAX as i128)) as i64
}
pub fn replay(records: &[Record]) -> Result<crate::learner::Learner, Box<dyn std::error::Error>> {
    let mut learner = crate::learner::Learner::default();
    for record in records {
        record.validate()?;
        if let Some(audit) = &record.policy_audit {
            let mut copy = record.clone();
            copy.apply_policy(
                &mut audit.before_controller.clone(),
                &mut audit.before_profile.clone(),
            );
            if copy.policy_audit != record.policy_audit || copy.decision != record.decision {
                return Err(
                    "policy state/decision differ from deterministic replay; preserve history"
                        .into(),
                );
            }
        }
        if matches!(
            record.kind,
            Kind::Entry | Kind::Recognition | Kind::Copying | Kind::Check
        ) {
            let mut derived = record.clone();
            derived.derive()?;
            if derived.metrics != record.metrics || derived.observations != record.observations {
                return Err(
                    "recorded scores/evidence differ from deterministic replay; preserve history"
                        .into(),
                );
            }
            for observation in derived.observations {
                learner.observe(observation)?;
            }
        }
    }
    Ok(learner)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcript::Edit;
    #[test]
    fn copying_record_replays_without_erasing_corrections_or_confusing_extra_keys() {
        let mut r = Record::new(
            "test",
            Context::copying(20, 5, Material::Groups),
            Kind::Copying,
        );
        r.onsets = vec![
            Symbol {
                character: 'A',
                at_ns: 0,
            },
            Symbol {
                character: 'B',
                at_ns: 100,
            },
        ];
        r.ends_ns = vec![50, 150];
        r.inputs = vec![
            (Edit::Type('A'), 60),
            (Edit::Type('X'), 160),
            (Edit::Backspace, 170),
            (Edit::Type('B'), 180),
        ]
        .into_iter()
        .map(|(edit, at_ns)| InputRecord {
            edit,
            at_ns,
            accepted: true,
        })
        .collect();
        r.derive().unwrap();
        assert_eq!(r.metrics.attempt_accuracy, Some(0.5));
        assert_eq!(r.metrics.final_accuracy, Some(1.0));
        assert_eq!(r.observations.len(), 2);
        assert!(r.observations.iter().all(|v| v.correct));
        let bytes = postcard::to_allocvec(&r).unwrap();
        let decoded: Record = postcard::from_bytes(&bytes).unwrap();
        assert!(replay(&[decoded]).is_ok());
        r.metrics.attempt_distance = 0;
        assert!(replay(&[r]).is_err());
    }
    #[test]
    fn interrupted_or_assisted_checks_do_not_qualify() {
        let mut r = Record::new(
            "test",
            Context::copying(20, 5, Material::Groups),
            Kind::Check,
        );
        r.completed = true;
        r.assessment_elapsed_ns = 180_000_000_000;
        r.metrics.target_count = 20;
        r.metrics.attempt_accuracy = Some(1.0);
        assert!(r.qualifying_check());
        r.rescues = 1;
        assert!(!r.qualifying_check());
        r.rescues = 0;
        r.compromised = Some("paused".into());
        assert!(!r.qualifying_check());
    }
    #[test]
    fn recognition_early_slow_assisted_and_interrupted_trials_remain_distinct() {
        let mut r = Record::new("test", Context::recognition(20), Kind::Recognition);
        r.trials = vec![
            RecognitionTrial {
                symbol: 'A',
                onset_ns: 10,
                end_ns: 20,
                response: Some(Symbol {
                    character: 'A',
                    at_ns: 15,
                }),
                assisted: false,
                compromised: false,
                explicit_unknown: false,
            },
            RecognitionTrial {
                symbol: 'B',
                onset_ns: 30,
                end_ns: 40,
                response: None,
                assisted: true,
                compromised: false,
                explicit_unknown: true,
            },
        ];
        r.derive().unwrap();
        assert_eq!(r.metrics.target_count, 1);
        assert_eq!(r.metrics.attempt_accuracy, Some(1.0));
        assert_eq!(r.observations[0].latency_ns, Some(-5));
        assert!(r.observations[1].context.assisted);
        r.trials[0].compromised = true;
        r.derive().unwrap();
        assert_eq!(r.metrics.attempt_accuracy, None);
    }
}
