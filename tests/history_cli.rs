use dih_dah_dojo::{
    history::History,
    learner::{Context, Profile},
    recording::{Kind, Record},
};
use std::{
    fs,
    path::PathBuf,
    process::{Command, Stdio},
};
static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "cw-cli-{}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn command(&self, args: &[&str]) -> std::process::Output {
        Command::new(env!("CARGO_BIN_EXE_dih_dah_dojo"))
            .args(args)
            .arg("--data-dir")
            .arg(&self.0)
            .stdin(Stdio::null())
            .output()
            .unwrap()
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn training_requires_a_terminal_before_creating_history() {
    let temp = Temp::new();
    let result = temp.command(&["train"]);
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("interactive terminal"));
    assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 0);
}
#[test]
fn progress_replay_export_and_confirmed_reset_work_offline() {
    let temp = Temp::new();
    {
        let mut history = History::open(temp.0.join("practice.redb")).unwrap();
        let mut profile = Profile {
            sessions: 1,
            ..Profile::default()
        };
        profile.introduce('K', 0);
        profile.introduce('M', 0);
        history
            .append(
                &Record::new("test", Context::recognition(20), Kind::SessionEnd),
                &profile,
            )
            .unwrap();
    }
    let progress = temp.command(&["progress"]);
    assert!(
        progress.status.success(),
        "{}",
        String::from_utf8_lossy(&progress.stderr)
    );
    assert!(String::from_utf8_lossy(&progress.stdout).contains("Sessions: 1"));
    assert!(temp.command(&["replay"]).status.success());
    let backup = temp.0.join("backup.cwbackup");
    assert!(
        temp.command(&["export", backup.to_str().unwrap()])
            .status
            .success()
    );
    assert_eq!(History::verify_export(&backup).unwrap(), 1);
    assert!(
        !temp
            .command(&["export", backup.to_str().unwrap()])
            .status
            .success()
    );
    assert!(!temp.command(&["reset", "--confirm", "no"]).status.success());
    assert!(String::from_utf8_lossy(&temp.command(&["progress"]).stdout).contains("Sessions: 1"));
    assert!(
        temp.command(&["reset", "--confirm", "DELETE"])
            .status
            .success()
    );
    assert!(String::from_utf8_lossy(&temp.command(&["progress"]).stdout).contains("Sessions: 0"));
    assert_eq!(History::verify_export(&backup).unwrap(), 1);
    assert!(!fs::read_dir(&temp.0).unwrap().any(|entry| {
        entry
            .unwrap()
            .path()
            .extension()
            .is_some_and(|v| v == "json")
    }));
}
#[test]
fn offline_command_rejects_corrupt_data_without_resetting_it() {
    let temp = Temp::new();
    let path = temp.0.join("practice.redb");
    fs::write(&path, b"corrupt database fixture").unwrap();
    assert!(!temp.command(&["progress"]).status.success());
    assert_eq!(fs::read(path).unwrap(), b"corrupt database fixture");
}
#[test]
fn diagnostic_rejects_invalid_duration_before_opening_a_device() {
    let output = Command::new(env!("CARGO_BIN_EXE_dih_dah_dojo"))
        .args(["diagnose", "--seconds", "0"])
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("1..3600"));
}
