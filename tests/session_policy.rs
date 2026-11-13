//! Frozen-clock session traces exercise scoring, policy, persistence, and replay together.
use dih_dah_dojo::{
    commands,
    control::{Backlog, Controller, RescueTracker},
    history::History,
    learner::{Context, Material, Profile},
    recording::{self, Kind, RecognitionTrial, Record},
    timing::SYMBOLS,
    transcript::{Edit, Symbol, Transcript},
};

fn profile() -> Profile {
    let mut p = Profile::default();
    for c in SYMBOLS.chars() {
        p.introduce(c, 1_799_971_200_000);
    }
    p.entry_complete = true;
    p
}
fn copy(p: &Profile, behavior: &str) -> Record {
    let mut r = Record::new(
        "frozen-session",
        Context::copying(p.copying_c, p.copying_e, Material::Groups),
        Kind::Copying,
    );
    r.utc_ms = 1_799_971_200_000;
    r.local_date = "2027-01-15".into();
    r.utc_offset_seconds = 0;
    r.repertoire = SYMBOLS.into();
    r.content = "ABCDEFGHIJKLMNOPQRSTUVWX".into();
    r.transport_start_ns = 0;
    r.transport_end_ns = 50_000_000_000;
    r.scheduled_ns = r.transport_end_ns;
    r.completed = true;
    let mut transcript = Transcript::default();
    for (i, c) in r.content.chars().enumerate() {
        let onset = i as u64 * 2_000_000_000;
        let end = onset + 400_000_000;
        r.onsets.push(Symbol {
            character: c,
            at_ns: onset,
        });
        r.ends_ns.push(end);
        if behavior == "no-input" || (behavior == "skip-rejoin" && (10..13).contains(&i)) {
            continue;
        }
        let at = end
            + if behavior == "stable-lag" {
                3_000_000_000
            } else {
                300_000_000
            };
        if behavior == "corrections" {
            transcript.record(Edit::Type('?'), at).unwrap();
            transcript.record(Edit::Backspace, at + 1).unwrap();
        }
        let response = if behavior == "substitution" && c == 'B' {
            '?'
        } else {
            c
        };
        transcript.record(Edit::Type(response), at + 2).unwrap();
    }
    r.inputs = transcript.events().to_vec();
    let lag = if behavior == "stable-lag" { 2 } else { 0 };
    r.backlog = (0..=50).map(|s| (s * 1_000_000_000, lag, lag)).collect();
    r.derive().unwrap();
    r
}

#[test]
fn copying_traces_separate_corrections_rejoining_stable_lag_and_overload() {
    let mut p = profile();
    let mut controller = Controller::default();
    let mut corrected = copy(&p, "corrections");
    assert_eq!(corrected.metrics.attempt_accuracy, Some(0.0));
    assert_eq!(corrected.metrics.final_accuracy, Some(1.0));
    corrected.apply_policy(&mut controller, &mut p);
    assert_eq!(
        p.copying_e, 4,
        "correction-heavy copying must not accelerate"
    );
    let rejoined = copy(&p, "skip-rejoin");
    assert_eq!(rejoined.metrics.attempt_accuracy, Some(0.875));
    assert!(
        rejoined
            .observations
            .iter()
            .rev()
            .take(11)
            .all(|o| o.correct)
    );

    controller = Controller::default();
    for _ in 0..2 {
        let mut lagged = copy(&p, "stable-lag");
        assert_eq!(lagged.metrics.attempt_accuracy, Some(1.0));
        assert!(
            lagged
                .observations
                .iter()
                .all(|o| o.latency_ns == Some(3_000_000_002))
        );
        lagged.apply_policy(&mut controller, &mut p);
    }
    assert_eq!(
        p.copying_e, 4,
        "qualified groups leave room for text transfer"
    );
    for _ in 0..2 {
        let mut text = copy(&p, "stable-lag");
        text.context.material = Material::Text;
        text.derive().unwrap();
        text.apply_policy(&mut controller, &mut p);
    }
    assert_eq!(
        p.copying_e, 5,
        "stable lag permits progression after text transfer"
    );
    let mut overloaded = copy(&p, "correct");
    overloaded.rescues = 2;
    overloaded.derive().unwrap();
    overloaded.apply_policy(&mut controller, &mut p);
    assert_eq!(p.copying_e, 4);
    assert!(overloaded.observations.iter().all(|o| o.context.assisted));
    assert!(!overloaded.qualifying_check());
}

#[test]
fn delayed_recognition_does_not_count_as_automatic_recognition() {
    let mut p = profile();
    let mut controller = Controller::default();
    let mut records = Vec::new();
    for block in 0..3 {
        let mut r = Record::new("slow", Context::recognition(20), Kind::Recognition);
        r.completed = true;
        for (i, symbol) in "KMURSNAP".chars().enumerate() {
            let onset = (block * 40 + i as u64 * 4) * 1_000_000_000;
            r.trials.push(RecognitionTrial {
                symbol,
                onset_ns: onset,
                end_ns: onset + 500_000_000,
                response: Some(Symbol {
                    character: symbol,
                    at_ns: onset + 2_500_000_000,
                }),
                assisted: false,
                compromised: false,
                explicit_unknown: false,
            });
        }
        r.derive().unwrap();
        r.apply_policy(&mut controller, &mut p);
        records.push(r);
    }
    assert_eq!(p.recognition_c, 20);
    let learner = recording::replay(&records).unwrap();
    let estimate = learner.estimate('K', Context::recognition(20), records[2].utc_ms);
    assert!(estimate.mean > 0.7);
    assert_eq!(estimate.latency_p90_ns, Some(2_000_000_000));
    assert_eq!(estimate.latency_count, 3);
}

#[test]
fn frozen_session_survives_binary_restart_and_detects_policy_tampering() {
    let path = std::env::temp_dir().join(format!("cw-session-trace-{}", std::process::id()));
    std::fs::create_dir_all(&path).unwrap();
    let mut p = profile();
    let mut controller = Controller::default();
    let mut records = Vec::new();
    {
        let mut history = History::open(path.join("practice.redb")).unwrap();
        for behavior in [
            "substitution",
            "substitution",
            "substitution",
            "stable-lag",
            "corrections",
            "no-input",
        ] {
            let mut r = copy(&p, behavior);
            r.apply_policy(&mut controller, &mut p);
            history.append(&r, &p).unwrap();
            records.push(r);
        }
    }
    let loaded = commands::load(path.clone()).unwrap();
    assert_eq!(loaded.profile, p);
    assert_eq!(loaded.records.len(), records.len());
    assert!(recording::replay(&loaded.records).is_ok());
    drop(loaded);
    records[0].decision.push_str(" forged");
    assert!(recording::replay(&records).is_err());
    let original_len = records[0].decision.len() - 7;
    records[0].decision.truncate(original_len);
    records[1]
        .policy_audit
        .as_mut()
        .unwrap()
        .after_profile
        .copying_e = 35;
    assert!(recording::replay(&records).is_err());
    std::fs::remove_dir_all(path).unwrap();
}

#[test]
fn no_input_and_rescue_are_bounded_and_future_or_stale_samples_cannot_trigger() {
    let mut p = profile();
    let mut controller = Controller::default();
    for _ in 0..100 {
        let mut r = copy(&p, "no-input");
        r.apply_policy(&mut controller, &mut p);
        assert!((12..=35).contains(&p.copying_c));
        assert!((3..=p.copying_c).contains(&p.copying_e));
    }
    assert_eq!((p.copying_c, p.copying_e), (12, 3));
    let mut rescue = RescueTracker::new(1.0);
    rescue.sample(Backlog {
        at_ns: 5_000_000_000,
        min: 2,
        max: 2,
    });
    rescue.sample(Backlog {
        at_ns: 8_000_000_000,
        min: 5,
        max: 7,
    });
    assert!(!rescue.should_request(7_000_000_000, 0, Some(3)));
    assert!(!rescue.should_request(9_000_000_000, 0, Some(3)));
    assert!(!rescue.should_request(8_000_000_000, 7_000_000_000, Some(2)));
    assert!(rescue.should_request(8_000_000_000, 0, None));
    rescue.applied(8_000_000_000);
    assert!(!rescue.should_request(8_000_000_000, 0, Some(3)));
}

#[test]
fn text_progression_fix_preserves_legacy_policy_replay() {
    let mut old_profile = profile();
    let mut old_controller = Controller::default();
    let mut old_records = Vec::new();
    for _ in 0..2 {
        let mut record = copy(&old_profile, "correct");
        record.policy = "cw-policy-v1".into();
        record.apply_policy(&mut old_controller, &mut old_profile);
        old_records.push(record);
    }
    assert_eq!(old_profile.copying_e, 6);
    assert!(recording::replay(&old_records).is_ok());

    let mut current_profile = profile();
    let mut current_controller = Controller::default();
    for _ in 0..2 {
        let mut record = copy(&current_profile, "correct");
        record.apply_policy(&mut current_controller, &mut current_profile);
    }
    assert_eq!(current_profile.copying_e, 5);
    assert_eq!(current_profile.group_qualifications.get(&(20, 5)), Some(&2));
    for _ in 0..2 {
        let mut record = copy(&current_profile, "correct");
        record.context.material = Material::Text;
        record.derive().unwrap();
        record.apply_policy(&mut current_controller, &mut current_profile);
    }
    assert_eq!(current_profile.copying_e, 6);
}

#[test]
fn trends_require_matching_repertoire_and_enough_comparable_blocks() {
    let p = profile();
    let mut records = Vec::new();
    for i in 0..6 {
        let mut record = copy(&p, "correct");
        record.metrics.attempt_accuracy = Some(if i < 3 { 0.8 } else { 0.9 });
        for observation in &mut record.observations {
            observation.latency_ns = Some(if i < 3 { 600_000_000 } else { 400_000_000 });
        }
        records.push(record);
    }
    let context = records[0].context;
    assert!((commands::trend(&records, context).unwrap() - 0.1).abs() < 1e-12);
    assert_eq!(
        commands::latency_trend(&records, context),
        Some(-200_000_000)
    );
    records[5].repertoire = "KM".into();
    assert_eq!(commands::trend(&records, context), None);
    assert_eq!(commands::latency_trend(&records, context), None);
}

#[test]
fn analysis_resource_failure_retains_a_compromised_record_without_partial_credit() {
    let mut record = copy(&profile(), "correct");
    record.onsets = vec![
        Symbol {
            character: 'E',
            at_ns: 0
        };
        2048
    ];
    record.ends_ns = vec![1; 2048];
    record.inputs = (0..2048)
        .map(|i| dih_dah_dojo::transcript::InputRecord {
            edit: Edit::Type('E'),
            at_ns: i + 1,
            accepted: true,
        })
        .collect();
    let mut analysis = dih_dah_dojo::analysis::Analysis::start().unwrap();
    let received = analysis
        .final_score(record)
        .unwrap()
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap()
        .unwrap();
    assert!(
        received
            .compromised
            .as_ref()
            .unwrap()
            .contains("resource limit")
    );
    assert!(received.observations.is_empty());
    assert_eq!(received.metrics.attempt_accuracy, None);
    assert_eq!(received.inputs.len(), 2048);
    assert!(recording::replay(&[*received]).is_ok());
}

#[test]
fn frozen_clock_crosses_midnight_and_equal_timestamp_records_keep_sequence_order() {
    let mut record = Record::new("fixed-clock", Context::recognition(20), Kind::Recognition);
    record.utc_ms = 86_399_500; // 1970-01-01 23:59:59.500 UTC
    record.wall_anchor_ns = 10_000_000_000;
    record.utc_offset_seconds = 0;
    record.local_date = "1970-01-01".into();
    record.trials.push(RecognitionTrial {
        symbol: 'K',
        onset_ns: 10_000_000_000,
        end_ns: 11_000_000_000,
        response: Some(Symbol {
            character: 'K',
            at_ns: 11_200_000_000,
        }),
        assisted: false,
        compromised: false,
        explicit_unknown: false,
    });
    record.derive().unwrap();
    assert_eq!(record.observations[0].utc_ms, 86_400_500);
    assert_eq!(record.observations[0].local_date, "1970-01-02");
    let path =
        std::env::temp_dir().join(format!("cw-equal-timestamps-{}.redb", std::process::id()));
    let mut history = History::open(&path).unwrap();
    let p = profile();
    assert_eq!(history.append(&record, &p).unwrap(), 1);
    assert_eq!(history.append(&record, &p).unwrap(), 2);
    let records: Vec<(u64, Record)> = history.records().unwrap();
    assert_eq!(
        records
            .iter()
            .map(|(sequence, _)| *sequence)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert_eq!(records[0].1.utc_ms, records[1].1.utc_ms);
    drop(history);
    std::fs::remove_file(&path).unwrap();
    let _ = std::fs::remove_file(path.with_extension("lock"));
}

#[test]
fn rejected_modified_letters_never_become_copying_evidence_and_v2_remains_readable() {
    let mut record = copy(&profile(), "correct");
    record.inputs.insert(
        0,
        dih_dah_dojo::transcript::InputRecord {
            edit: Edit::Unsupported('K'),
            at_ns: 0,
            accepted: false,
        },
    );
    record.derive().unwrap();
    assert_eq!(record.metrics.attempt_accuracy, Some(1.0));
    assert_eq!(record.metrics.target_count, 24);
    assert!(record.observations.iter().all(|o| o.correct));
    let encoded = postcard::to_allocvec(&record).unwrap();
    let decoded: Record = postcard::from_bytes(&encoded).unwrap();
    assert!(recording::replay(&[decoded]).is_ok());
    let mut legacy = copy(&profile(), "correct");
    legacy.schema = 2;
    assert!(recording::replay(&[legacy]).is_ok());
}

#[test]
fn delivered_character_throughput_includes_rescue_and_excludes_response_tail() {
    let mut record = copy(&profile(), "correct");
    record.metrics.target_count = 15;
    record.scheduled_ns = 30_000_000_000;
    record.rescue_ns = 15_000_000_000;
    assert_eq!(record.characters_per_minute(), Some(20.0));
    record.inputs.push(dih_dah_dojo::transcript::InputRecord {
        edit: Edit::Type('K'),
        at_ns: 90_000_000_000,
        accepted: true,
    });
    assert_eq!(record.characters_per_minute(), Some(20.0));
    record.metrics.target_count = 0;
    assert_eq!(record.characters_per_minute(), None);
}
