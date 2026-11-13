use std::process::{Command, Stdio};
fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_dih_dah_dojo"))
        .args(args)
        .stdin(Stdio::null())
        .output()
        .unwrap()
}
#[test]
fn offline_score_preserves_corrections_without_a_terminal() {
    let output = run(&["score", "AB", "AX\\bB"]);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8(output.stdout).unwrap();
    for expected in [
        "Untimed comparison",
        "Attempts: AXB",
        "Final:    AB",
        "Attempt accuracy: 50.00%",
        "Final accuracy: 100.00%",
    ] {
        assert!(text.contains(expected), "missing {expected}: {text}");
    }
}
#[test]
fn repeated_symbols_and_space_scores_are_reported_honestly() {
    let repeated = run(&["score", "AAA", "AA"]);
    assert!(repeated.status.success());
    let text = String::from_utf8(repeated.stdout).unwrap();
    assert_eq!(text.matches(": ambiguous").count(), 3);
    let spaces = run(&["score", "A B", "AB"]);
    let text = String::from_utf8(spaces.stdout).unwrap();
    assert!(text.contains("Attempt accuracy: 100.00%"));
    assert!(text.contains("Including spaces: attempt 66.67%"));
}
#[test]
fn invalid_scoring_input_fails_without_opening_audio() {
    for args in [
        vec!["score", "AB"],
        vec!["score", "@", "A"],
        vec!["score", "A", "@"],
        vec!["score", "A", "\\x"],
    ] {
        let output = run(&args);
        assert!(!output.status.success());
        assert!(!String::from_utf8_lossy(&output.stdout).contains("Native audio"));
    }
    let empty = run(&["score", "", "A"]);
    assert!(empty.status.success());
    assert!(String::from_utf8_lossy(&empty.stdout).contains("unavailable (empty target)"));
}
#[test]
fn noninteractive_probe_provides_actionable_terminal_error() {
    let output = run(&["probe", "PARIS", "20", "5"]);
    assert!(!output.status.success());
    let error = String::from_utf8(output.stderr).unwrap();
    assert!(error.contains("needs a terminal; use --no-input"));
}
