//! Offline history/analytics commands. None requires an audio device or terminal.
use crate::{
    history::History,
    learner::{Context, Learner, Profile},
    recording::{self, Kind, Record},
};
use std::{error::Error, path::PathBuf};

pub fn data_directory(args: &mut Vec<String>) -> Result<PathBuf, Box<dyn Error>> {
    let mut selected = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--data-dir" {
            if selected.is_some() {
                return Err("--data-dir can be supplied only once".into());
            }
            if i + 1 >= args.len() {
                return Err("missing --data-dir path".into());
            }
            args.remove(i);
            selected = Some(PathBuf::from(args.remove(i)));
        } else {
            i += 1;
        }
    }
    if let Some(path) = selected {
        return Ok(path);
    }
    if let Some(path) = std::env::var_os("CW_DOJO_DATA_DIR") {
        return Ok(path.into());
    }
    let home = std::env::var_os("HOME").ok_or("set CW_DOJO_DATA_DIR or pass --data-dir PATH")?;
    #[cfg(target_os = "macos")]
    let path = PathBuf::from(home).join("Library/Application Support/dih-dah-dojo");
    #[cfg(not(target_os = "macos"))]
    let path = PathBuf::from(home).join(".local/share/dih-dah-dojo");
    Ok(path)
}
pub struct Loaded {
    pub history: History,
    pub profile: Profile,
    pub records: Vec<Record>,
    pub learner: Learner,
}
pub fn load(directory: PathBuf) -> Result<Loaded, Box<dyn Error>> {
    let history = History::open(directory.join("practice.redb"))?;
    let state = history.state::<Profile>()?;
    let records: Vec<Record> = history
        .records()?
        .into_iter()
        .map(|(_, record)| record)
        .collect();
    if state.is_none() && !records.is_empty() {
        return Err("history has records without committed state; preserve database".into());
    }
    let mut profile = state.unwrap_or_default();
    profile.validate()?;
    if let Some(audit) = records
        .last()
        .and_then(|record| record.policy_audit.as_ref())
        && audit.after_profile
            != if records.last().is_some_and(|r| r.schema >= 4) {
                profile.policy_snapshot()
            } else {
                profile.clone()
            }
    {
        return Err("committed profile differs from its event; preserve history".into());
    }
    let learner = recording::replay(&records)?;
    profile.rebuild_presentation_indexes(&records);
    Ok(Loaded {
        history,
        profile,
        records,
        learner,
    })
}
pub fn run(command: &str, args: &[String]) -> Result<(), Box<dyn Error>> {
    let mut args = args.to_vec();
    if command == "verify-export" {
        if args.len() != 1 {
            return Err("usage: verify-export FILE.cwbackup".into());
        }
        println!(
            "Binary backup verified: {} records",
            History::verify_export(&args[0])?
        );
        return Ok(());
    }
    let directory = data_directory(&mut args)?;
    if !matches!(command, "progress" | "replay" | "export" | "reset") {
        return Err("unknown history command".into());
    }
    match command {
        "progress" | "replay" if !args.is_empty() => {
            return Err("unexpected argument; only --data-dir PATH is accepted".into());
        }
        "export" if args.len() != 1 => {
            return Err("usage: export FILE.cwbackup [--data-dir PATH]".into());
        }
        "reset" if args != ["--confirm", "DELETE"] => return Err(
            "reset deletes local learning history; use reset --confirm DELETE [--data-dir PATH]"
                .into(),
        ),
        _ => {}
    }
    let mut loaded = load(directory)?;
    match command {
        "progress" => print_progress(&loaded),
        "replay" => println!(
            "Verified deterministic score/evidence and policy-state replay for {} records (stored policy versions)",
            loaded.records.len()
        ),
        "export" => {
            loaded.history.export(&args[0])?;
            println!("Exported a consistent binary snapshot to {}", args[0]);
        }
        "reset" => {
            loaded.history.reset("DELETE")?;
            println!("Local history and derived state reset. Exported backups were not changed.");
        }
        _ => unreachable!(),
    }
    Ok(())
}
fn print_progress(loaded: &Loaded) {
    let p = &loaded.profile;
    let now = chrono::Utc::now().timestamp_millis();
    println!(
        "CW DOJO — LOCAL PROGRESS\nDatabase: {}\nSessions: {} | records: {}",
        loaded.history.path().display(),
        p.sessions,
        loaded.records.len()
    );
    println!(
        "Recognition: {} character WPM | copying target: {}/{} WPM\nIntroduced: {}",
        p.recognition_c,
        p.copying_c,
        p.copying_e,
        if p.introduced.is_empty() {
            "none yet"
        } else {
            &p.introduced
        }
    );
    println!("Symbol | recognition mean [model 10–90%] | evidence | latency median/p90 | review");
    for c in crate::timing::SYMBOLS
        .chars()
        .filter(|c| p.introduced.contains(*c))
    {
        let e = loaded
            .learner
            .estimate(c, Context::recognition(p.recognition_c), now);
        let latency = |v: Option<i64>| {
            v.map_or_else(|| "unknown".into(), |v| format!("{:.0}ms", v as f64 / 1e6))
        };
        let due = p.reviews.get(&c).map_or("unobserved", |r| {
            if r.due_ms <= now { "due" } else { "scheduled" }
        });
        println!(
            "{c} | {:.0}% [{:.0}–{:.0}%] | {:.1} | {}/{} | {due}{}",
            100.0 * e.mean,
            100.0 * e.lower,
            100.0 * e.upper,
            e.effective_evidence,
            latency(e.latency_median_ns),
            latency(e.latency_p90_ns),
            if e.reliable {
                "; reliable here"
            } else {
                "; uncertain"
            }
        );
        for (response, _, count) in e.confusions.iter().filter(|v| v.2 >= 3).take(2) {
            println!("  directed confusion: {c} -> {response}, {count} attributable substitutions");
        }
    }
    println!("Recent copying (attempt/final, requested speed, assistance):");
    for r in loaded
        .records
        .iter()
        .rev()
        .filter(|r| matches!(r.kind, Kind::Copying | Kind::Check))
        .take(10)
    {
        let percent = |v: Option<f64>| {
            v.map_or_else(|| "unavailable".into(), |a| format!("{:.1}%", a * 100.0))
        };
        let delivered = if r.scheduled_ns > 0 {
            r.context.effective_wpm as f64 * r.scheduled_ns as f64
                / (r.scheduled_ns + r.rescue_ns) as f64
        } else {
            0.0
        };
        println!(
            "{} {:?} {:?}: {}/{}; {}/{} WPM, adjusted E {:.2}; rescue {}, {}",
            r.local_date,
            r.kind,
            r.context.material,
            percent(r.metrics.attempt_accuracy),
            percent(r.metrics.final_accuracy),
            r.context.character_wpm,
            r.context.effective_wpm,
            delivered,
            r.rescues,
            if r.compromised.is_some() {
                "compromised"
            } else if r.completed {
                "complete"
            } else {
                "incomplete"
            }
        );
        println!("  {}", r.pace_summary());
        if let Some(reason) = &r.compromised {
            println!("  Excluded: {reason}");
        }
    }
    for context in [
        Context::recognition(loaded.profile.recognition_c),
        Context::copying(
            loaded.profile.copying_c,
            loaded.profile.copying_e,
            crate::learner::Material::Groups,
        ),
    ] {
        if let Some(delta) = trend(&loaded.records, context) {
            println!(
                "{:?} comparable accuracy change: {:+.1} percentage points",
                context.mode,
                delta * 100.0
            );
        }
        if let Some(delta) = latency_trend(&loaded.records, context) {
            println!(
                "{:?} comparable response-latency change: {:+.0} ms (typing included)",
                context.mode,
                delta as f64 / 1e6
            );
        }
    }
    let milestones = milestones(&loaded.records);
    if milestones.is_empty() {
        println!("No repeated-day unassisted milestone yet.");
    } else {
        for line in milestones {
            println!("Milestone: {line}");
        }
    }
    println!(
        "Model intervals are approximate; latency includes typing and delivery-estimate error. Unknown contexts are not mastery claims."
    );
}
pub use dojo_core::assessment::{
    canonical_repertoire, check_context, latency_trend, milestones, trend,
};
#[cfg(test)]
mod tests {
    use super::*;
    use crate::learner::Material;
    #[test]
    fn check_pairs_require_distinct_dates_and_matching_conditions() {
        let mut a = Record::new("s", Context::copying(20, 5, Material::Groups), Kind::Check);
        a.completed = true;
        a.assessment_elapsed_ns = 180_000_000_000;
        a.repertoire = "KM".into();
        a.metrics.target_count = 30;
        a.metrics.attempt_accuracy = Some(1.0);
        a.local_date = "2026-11-14".into();
        let mut b = a.clone();
        assert!(milestones(&[a.clone(), b.clone()]).is_empty());
        b.local_date = "2026-11-15".into();
        assert_eq!(milestones(&[a.clone(), b.clone()]).len(), 1);
        b.context.effective_wpm = 6;
        assert!(milestones(&[a, b]).is_empty());
    }
    #[test]
    fn check_eligibility_uses_demonstrated_speed_instead_of_an_unproven_increase() {
        let mut p = Profile {
            sessions: 3,
            copying_e: 6,
            ..Profile::default()
        };
        p.introduce('K', 0);
        p.introduce('M', 0);
        p.check_qualifications.insert((20, 5, Material::Groups), 2);
        let (context, repertoire) = check_context(&p, &[], "2026-11-14").unwrap();
        assert_eq!(context.effective_wpm, 5);
        assert_eq!(repertoire, "KM");
        p.offered_dates.insert("2026-11-14".into());
        assert!(check_context(&p, &[], "2026-11-14").is_none());
    }
}
